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

export interface Options { soapUrl?: string; rateLimit?: number; retryDelayMs?: number; timeoutMs?: number; amqpUrl?: string; kafkaBrokers?: string }
const OPTIONS = 'OPTIONS';
const MAX_ATTEMPTS = 3;
export const QUEUE = 'applications.submit';
export const TOPIC = 'applications-submit';

/** Транспорт событий: RabbitMQ (AMQP_URL) или Kafka (KAFKA_BROKERS). */
interface Transport { publish(key: string, payload: string): Promise<void>; close(): Promise<void> }
interface KafkaLike { admin(): { connect(): Promise<void>; createTopics(o: object): Promise<unknown>; disconnect(): Promise<void> }; producer(): { connect(): Promise<void>; send(o: object): Promise<unknown>; disconnect(): Promise<void> }; consumer(o: object): { connect(): Promise<void>; subscribe(o: object): Promise<void>; run(o: object): Promise<void>; disconnect(): Promise<void> } }

interface AmqpChannel { assertQueue(q: string, o: object): Promise<unknown>; sendToQueue(q: string, b: Buffer, o?: object): boolean; consume(q: string, cb: (m: { content: Buffer } | null) => void): Promise<unknown>; ack(m: unknown): void; prefetch(n: number): Promise<unknown>; waitForConfirms(): Promise<void>; close(): Promise<void> }
interface AmqpConn { createConfirmChannel(): Promise<AmqpChannel>; close(): Promise<void> }

type Row = Record<string, unknown>;
interface Q { query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
interface Database extends Q { exec(sql: string): Promise<unknown>; transaction<T>(fn: (tx: Q) => Promise<T>): Promise<T>; close(): Promise<void> }

/** PGlite по умолчанию; при DATABASE_URL — настоящий PostgreSQL через драйвер pg (npm install в этой папке). */
async function openDatabase(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (!url) return new PGlite() as unknown as Database;
  const { default: pg } = (await import(/* @vite-ignore */ 'pg')) as { default: { Pool: new (o: { connectionString: string }) => { query: Q['query']; connect: () => Promise<{ query: Q['query']; release: () => void }>; end: () => Promise<void> } } };
  const pool = new pg.Pool({ connectionString: url });
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: async (sql) => { await pool.query(sql); },
    async transaction(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await fn({ query: (q, p) => c.query(q, p) }); await c.query('COMMIT'); return r; }
      catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
      finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

@Injectable()
export class Db implements OnModuleInit, OnApplicationShutdown {
  pg!: Database;
  async onModuleInit() {
    this.pg = await openDatabase();
    await this.pg.exec(`
      DROP TABLE IF EXISTS status_history, inbox, outbox, application;
      CREATE TABLE application (seq bigserial PRIMARY KEY, id uuid UNIQUE NOT NULL, title text NOT NULL, payload jsonb, status text NOT NULL DEFAULT 'NEW', idempotency_key text UNIQUE);
      CREATE TABLE outbox (id bigserial PRIMARY KEY, application_id uuid NOT NULL, attempts int NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), done boolean NOT NULL DEFAULT false, published boolean NOT NULL DEFAULT false);
      CREATE TABLE inbox (message_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
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

  private transport?: Transport;
  readonly stats = { published: 0, received: 0, duplicates: 0 };

  async onModuleInit() {
    if (this.opts.amqpUrl) this.transport = await this.connectRabbit();
    else if (this.opts.kafkaBrokers) this.transport = await this.connectKafka();
    if (this.opts.soapUrl) { this.timer = setInterval(() => void this.tick(), 20); this.timer.unref(); }
  }
  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.transport?.close().catch(() => {});
  }

  private async connectRabbit(): Promise<Transport> {
    const amqp = (await import(/* @vite-ignore */ 'amqplib')) as unknown as { default: { connect: (u: string) => Promise<AmqpConn> } };
    const conn = await amqp.default.connect(this.opts.amqpUrl!);
    const ch = await conn.createConfirmChannel();
    await ch.assertQueue(QUEUE, { durable: true });
    await ch.prefetch(1);
    await ch.consume(QUEUE, (m) => { if (m) void this.handle(m.content.toString()).then(() => ch.ack(m), () => {}); });
    return {
      publish: async (_key, payload) => { ch.sendToQueue(QUEUE, Buffer.from(payload), { persistent: true }); await ch.waitForConfirms(); },
      close: async () => { await ch.close(); await conn.close(); },
    };
  }

  /** Kafka: ключ сообщения = идентификатор заявки (порядок событий одной заявки), consumer group, смещение фиксируется после обработки. */
  private async connectKafka(): Promise<Transport> {
    const { Kafka, logLevel } = (await import(/* @vite-ignore */ 'kafkajs')) as unknown as { Kafka: new (o: object) => KafkaLike; logLevel: { NOTHING: number } };
    const kafka = new Kafka({ clientId: 'capstone', brokers: this.opts.kafkaBrokers!.split(','), logLevel: logLevel.NOTHING });
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({ waitForLeaders: true, topics: [{ topic: TOPIC, numPartitions: 3 }] });
    await admin.disconnect();
    const producer = kafka.producer();
    await producer.connect();
    const consumer = kafka.consumer({ groupId: 'capstone-workers' });
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
    await consumer.run({ eachMessage: async ({ message }: { message: { value: Buffer | null } }) => { await this.handle(message.value!.toString()); } });
    return {
      publish: async (key, payload) => { await producer.send({ topic: TOPIC, messages: [{ key, value: payload }], acks: -1 }); },
      close: async () => { await consumer.disconnect(); await producer.disconnect(); },
    };
  }

  /** Потребитель: сначала запись в inbox (повторная доставка отбрасывается), затем обработка. Ошибка → сообщение не подтверждается. */
  async handle(raw: string) {
    const msg = JSON.parse(raw) as { messageId: string; jobId: number };
    this.stats.received++;
    const ins = await this.db.pg.query('INSERT INTO inbox (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id', [msg.messageId]);
    if (ins.rows.length === 0) this.stats.duplicates++;
    else await this.processJob(msg.jobId);
  }

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

  /** Воркер: без брокера обрабатывает outbox напрямую; с брокером публикует записи в очередь (relay). */
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const j = await this.db.pg.query<{ id: number }>('SELECT id FROM outbox WHERE done = false AND published = false AND next_at <= now() ORDER BY id LIMIT 1');
      const job = j.rows[0];
      if (!job) return;
      if (!this.transport) return void (await this.processJob(job.id));
      const row = (await this.db.pg.query<{ attempts: number; application_id: string }>('SELECT attempts, application_id FROM outbox WHERE id = $1', [job.id])).rows[0];
      await this.transport.publish(row.application_id, JSON.stringify({ messageId: `${job.id}:${row.attempts}`, jobId: job.id })); // публикация подтверждена брокером
      await this.db.pg.query('UPDATE outbox SET published = true WHERE id = $1', [job.id]);
      this.stats.published++;
    } finally { this.busy = false; }
  }

  async processJob(jobId: number) {
    const j = await this.db.pg.query<{ id: number; application_id: string; attempts: number }>('SELECT * FROM outbox WHERE id = $1 AND done = false', [jobId]);
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
      else await this.db.pg.query("UPDATE outbox SET attempts = attempts + 1, published = false, next_at = now() + ($2 || ' milliseconds')::interval WHERE id = $1", [job.id, String((this.opts.retryDelayMs ?? 50) * 2 ** job.attempts)]);
    }
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
  const app = await createNestApp({ soapUrl: process.env.SOAP_URL, amqpUrl: process.env.AMQP_URL, kafkaBrokers: process.env.KAFKA_BROKERS, rateLimit: Number(process.env.RATE_LIMIT ?? 0) });
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
  console.log('listening');
}
