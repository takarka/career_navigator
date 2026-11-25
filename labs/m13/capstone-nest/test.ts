// Приёмка эталона на NestJS + PGlite: контракт (labs/m13/acceptance), Outbox, Fault, таймаут, rate limit.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ApplicationsService, QUEUE, TOPIC, createNestApp } from './app.ts';

const require_ = createRequire(import.meta.url);
const { start } = require_('../../m12/soap-mock/mock.cjs') as { start: (p: number) => Promise<import('node:http').Server> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mock = await start(0);
const app = await createNestApp({ soapUrl: `http://127.0.0.1:${(mock.address() as { port: number }).port}/`, retryDelayMs: 20, timeoutMs: 200, amqpUrl: process.env.AMQP_URL, kafkaBrokers: process.env.KAFKA_BROKERS });
await app.listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${new URL(await app.getUrl()).port}`;
const post = async (body: unknown, key: string) => (await fetch(base + '/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) })).json() as Promise<{ id: string }>;
const get = async (id: string) => (await fetch(`${base}/applications/${id}`)).json() as Promise<{ status: string }>;
const wait = async (id: string, want: string) => { for (let i = 0; i < 150; i++) { if ((await get(id)).status === want) return true; await sleep(30); } return false; };

const problems: string[] = [];
if (!(await wait((await post({ title: 'ok', payload: { requestId: 42 } }, 'n1')).id, 'ACCEPTED'))) problems.push('requestId=42 не стал ACCEPTED');
if (!(await wait((await post({ title: 'f', payload: { requestId: 0 } }, 'n2')).id, 'REJECTED'))) problems.push('Fault не привёл к REJECTED');
if (!(await wait((await post({ title: 's', payload: { requestId: 'slow' } }, 'n3')).id, 'FAILED'))) problems.push('таймаут не привёл к FAILED');

const acc = await new Promise<{ code: number | null; out: string }>((resolve) => {
  const p = spawn(process.execPath, ['test.cjs'], { cwd: join(import.meta.dirname, '..', 'acceptance'), env: { ...process.env, BASE_URL: base } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});
if (acc.code !== 0) problems.push('приёмка контракта не прошла:\n' + acc.out);

// приложение для проверки лимита всегда на PGlite, чтобы не пересоздавать таблицы основного приложения
const savedUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
// брокер (AMQP_URL или KAFKA_BROKERS): события прошли через RabbitMQ, повторная доставка отбрасывается inbox
if (process.env.AMQP_URL || process.env.KAFKA_BROKERS) {
  const svc = app.get(ApplicationsService);
  if (svc.stats.published < 3) problems.push(`через брокер опубликовано ${svc.stats.published} сообщений (ожидалось не менее 3)`);
  const before = { ...svc.stats };
  const done = (await (svc as unknown as { db: { pg: { query: (q: string) => Promise<{ rows: { id: number }[] }> } } }).db.pg.query('SELECT id FROM outbox WHERE done = true ORDER BY id LIMIT 1')).rows[0];
  const dup = JSON.stringify({ messageId: `${done.id}:0`, jobId: done.id });
  // повторная доставка того же сообщения (в брокер публикуем напрямую, мимо outbox)
  if (process.env.AMQP_URL) {
    const amqp = (await import('amqplib')) as unknown as { default: { connect: (u: string) => Promise<{ createChannel: () => Promise<{ sendToQueue: (q: string, b: Buffer) => boolean; close: () => Promise<void> }>; close: () => Promise<void> }> } };
    const c = await amqp.default.connect(process.env.AMQP_URL);
    const ch = await c.createChannel();
    ch.sendToQueue(QUEUE, Buffer.from(dup)); ch.sendToQueue(QUEUE, Buffer.from(dup));
    await sleep(500);
    await ch.close(); await c.close();
  } else {
    const { Kafka, logLevel } = (await import('kafkajs')) as unknown as { Kafka: new (o: object) => { producer: () => { connect: () => Promise<void>; send: (o: object) => Promise<unknown>; disconnect: () => Promise<void> } }; logLevel: { NOTHING: number } };
    const prod = new Kafka({ clientId: 'dup', brokers: process.env.KAFKA_BROKERS!.split(','), logLevel: logLevel.NOTHING }).producer();
    await prod.connect();
    await prod.send({ topic: TOPIC, messages: [{ key: 'dup', value: dup }, { key: 'dup', value: dup }] });
    await prod.disconnect();
    for (let i = 0; i < 100 && svc.stats.duplicates < before.duplicates + 2; i++) await sleep(100);
  }
  if (svc.stats.duplicates < before.duplicates + 1) problems.push('повторная доставка не отброшена inbox: ' + JSON.stringify({ before, after: svc.stats }));
}

const lim = await createNestApp({ rateLimit: 5 });
if (savedUrl) process.env.DATABASE_URL = savedUrl;
await lim.listen(0, '127.0.0.1');
const limBase = `http://127.0.0.1:${new URL(await lim.getUrl()).port}`;
const codes: number[] = [];
// окно фиксированное (1 с): 12 быстрых запросов при пороге 5 дают 429 даже если их разделит граница секунды
for (let i = 0; i < 12; i++) codes.push((await fetch(limBase + '/applications')).status);
if (!codes.includes(429)) problems.push('rate limit не вернул 429: ' + codes.join(','));
await lim.close();

await app.close();
mock.closeAllConnections();
mock.close();
if (problems.length) { problems.forEach((p) => console.log('ПРОВАЛ ' + p)); process.exit(1); }
console.log(`OK: NestJS + ${process.env.DATABASE_URL ? 'PostgreSQL (pg)' : 'PGlite'}${process.env.AMQP_URL ? ' + RabbitMQ' : ''}${process.env.KAFKA_BROKERS ? ' + Kafka' : ''}: контракт, Outbox, Fault, таймаут, ретраи, rate limit`);
process.exit(0);
