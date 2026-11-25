/**
 * Эталон capstone на NestJS + PostgreSQL (PGlite, настоящий PostgreSQL в WASM).
 * Брокер заменён таблицей outbox и воркером внутри процесса; WebSocket не реализован (см. capstone-reference).
 * Зависимости внедряются через явные @Inject: esbuild (tsx) не поддерживает emitDecoratorMetadata.
 */
import 'reflect-metadata';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, Injectable, MiddlewareConsumer, Module, NestMiddleware, NotFoundException,
  OnApplicationShutdown, OnModuleInit, Param, Post, Query, ConflictException, Res,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const require_ = createRequire(import.meta.url);
const { getStatus, SoapFault } = require_('../../m12/soap-mock/solution/client.cjs') as {
  getStatus: (url: string, id: string, timeoutMs: number) => Promise<{ status: string }>;
  SoapFault: new (...a: never[]) => Error;
};

export interface Options { soapUrl?: string; rateLimit?: number; retryDelayMs?: number; timeoutMs?: number }
const OPTIONS = 'OPTIONS';
const MAX_ATTEMPTS = 3;

@Injectable()
export class Db implements OnModuleInit, OnApplicationShutdown {
  readonly pg = new PGlite();
  async onModuleInit() {
    await this.pg.exec(`
      CREATE TABLE application (seq bigserial PRIMARY KEY, id uuid UNIQUE NOT NULL, title text NOT NULL, payload jsonb, status text NOT NULL DEFAULT 'NEW', idempotency_key text UNIQUE);
      CREATE TABLE outbox (id bigserial PRIMARY KEY, application_id uuid NOT NULL, attempts int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), done boolean NOT NULL DEFAULT false);
      CREATE TABLE status_history (id bigserial PRIMARY KEY, application_id uuid NOT NULL, status text NOT NULL, at timestamptz NOT NULL DEFAULT now());
    `);
  }
  async onApplicationShutdown() { await this.pg.close(); }
}

const view = (r: Record<string, unknown>) => ({ id: r.id, title: r.title, payload: r.payload ?? null, status: r.status });

@Injectable()
export class ApplicationsService implements OnModuleInit, OnApplicationShutdown {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(@Inject(Db) private readonly db: Db, @Inject(OPTIONS) private readonly opts: Options) {}

  onModuleInit() {
    if (this.opts.soapUrl) { this.timer = setInterval(() => void this.tick(), 20); this.timer.unref(); }
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  async create(body: { title?: unknown; payload?: unknown }, key?: string) {
    if (typeof body?.title !== 'string' || !body.title) throw new BadRequestException('title must be a non-empty string');
    const id = randomUUID();
    // заявка, строка outbox и история — одна транзакция; ключ идемпотентности защищён UNIQUE
    const res = await this.db.pg.transaction(async (tx) => {
      const ins = await tx.query<Record<string, unknown>>(
        'INSERT INTO application (id, title, payload, idempotency_key) VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *',
        [id, body.title, body.payload === undefined ? null : JSON.stringify(body.payload), key ?? null],
      );
      if (ins.rows.length === 0) return { created: false as const };
      await tx.query('INSERT INTO outbox (application_id) VALUES ($1)', [id]);
      await tx.query("INSERT INTO status_history (application_id, status) VALUES ($1, 'NEW')", [id]);
      return { created: true as const, row: ins.rows[0] };
    });
    if (!res.created) {
      const ex = await this.db.pg.query<Record<string, unknown>>('SELECT * FROM application WHERE idempotency_key = $1', [key]);
      return { created: false, app: view(ex.rows[0]) };
    }
    return { created: true, app: view(res.row) };
  }

  async get(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundException();
    const r = await this.db.pg.query<Record<string, unknown>>('SELECT * FROM application WHERE id = $1', [id]);
    if (!r.rows[0]) throw new NotFoundException();
    return view(r.rows[0]);
  }

  async list(limit: number, cursor?: string) {
    const after = cursor ? Number(Buffer.from(cursor, 'base64').toString()) || 0 : 0;
    const r = await this.db.pg.query<Record<string, unknown>>('SELECT * FROM application WHERE seq > $1 ORDER BY seq LIMIT $2', [after, limit + 1]);
    const items = r.rows.slice(0, limit);
    const nextCursor = r.rows.length > limit ? Buffer.from(String(items[items.length - 1].seq)).toString('base64') : null;
    return { items: items.map(view), nextCursor };
  }

  async cancel(id: string) {
    await this.get(id);
    const r = await this.db.pg.query<Record<string, unknown>>("UPDATE application SET status = 'CANCELLED' WHERE id = $1 AND status <> 'CANCELLED' RETURNING *", [id]);
    if (!r.rows[0]) throw new ConflictException('already cancelled');
    await this.db.pg.query("INSERT INTO status_history (application_id, status) VALUES ($1, 'CANCELLED')", [id]);
    return view(r.rows[0]);
  }

  private async setStatus(id: string, status: string) {
    await this.db.pg.query('UPDATE application SET status = $2 WHERE id = $1', [id, status]);
    await this.db.pg.query('INSERT INTO status_history (application_id, status) VALUES ($1, $2)', [id, status]);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const j = await this.db.pg.query<{ id: number; application_id: string; attempts: number }>('SELECT * FROM outbox WHERE done = false AND next_at <= now() ORDER BY id LIMIT 1');
      const job = j.rows[0];
      if (!job) return;
      const a = (await this.db.pg.query<{ status: string; payload: { requestId?: unknown } | null }>('SELECT status, payload FROM application WHERE id = $1', [job.application_id])).rows[0];
      const done = () => this.db.pg.query('UPDATE outbox SET done = true WHERE id = $1', [job.id]);
      if (a.status === 'CANCELLED') return void (await done());
      try {
        const r = await getStatus(this.opts.soapUrl!, String(a.payload?.requestId ?? 42), this.opts.timeoutMs ?? 500);
        await this.setStatus(job.application_id, r.status === 'accepted' ? 'ACCEPTED' : 'SUBMITTED');
        await done();
      } catch (e) {
        if (e instanceof SoapFault) { await this.setStatus(job.application_id, 'REJECTED'); await done(); }
        else if (job.attempts + 1 >= MAX_ATTEMPTS) { await this.setStatus(job.application_id, 'FAILED'); await done(); }
        else await this.db.pg.query('UPDATE outbox SET attempts = attempts + 1, next_at = now() + ($2 || \' milliseconds\')::interval WHERE id = $1', [job.id, String((this.opts.retryDelayMs ?? 50) * 2 ** job.attempts)]);
      }
    } finally { this.busy = false; }
  }
}

@Controller('applications')
export class ApplicationsController {
  constructor(@Inject(ApplicationsService) private readonly svc: ApplicationsService) {}
  @Post() async create(@Body() body: { title?: unknown; payload?: unknown }, @Headers('idempotency-key') key: string | undefined, @Res({ passthrough: true }) res: { status: (c: number) => void }) {
    const r = await this.svc.create(body, key);
    res.status(r.created ? 201 : 200);
    return r.app;
  }
  @Get() list(@Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.svc.list(Math.min(Number(limit ?? 20) || 20, 100), cursor); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param('id') id: string) { return this.svc.cancel(id); }
}

@Injectable()
export class RateLimit implements NestMiddleware {
  private hits = new Map<string, { sec: number; n: number }>();
  constructor(@Inject(OPTIONS) private readonly opts: Options) {}
  use(req: { ip?: string; socket: { remoteAddress?: string } }, res: { status: (c: number) => { json: (b: unknown) => void }; setHeader: (k: string, v: string) => void }, next: () => void) {
    const limit = this.opts.rateLimit ?? 0;
    if (!limit) return next();
    const sec = Math.floor(Date.now() / 1000);
    const ip = req.socket.remoteAddress ?? '?';
    const h = this.hits.get(ip);
    const n = h && h.sec === sec ? h.n + 1 : 1;
    this.hits.set(ip, { sec, n });
    if (n > limit) { res.setHeader('Retry-After', '1'); return res.status(429).json({ error: 'too many requests' }); }
    next();
  }
}

export async function createNestApp(opts: Options = {}) {
  @Module({
    controllers: [ApplicationsController],
    providers: [Db, ApplicationsService, RateLimit, { provide: OPTIONS, useValue: opts }],
  })
  class AppModule {
    configure(c: MiddlewareConsumer) { c.apply(RateLimit).forRoutes('*'); }
  }
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.enableShutdownHooks();
  await app.init();
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createNestApp({ soapUrl: process.env.SOAP_URL, rateLimit: Number(process.env.RATE_LIMIT ?? 0) });
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
  console.log('listening');
}
