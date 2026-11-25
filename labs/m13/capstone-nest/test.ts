// Приёмка эталона на NestJS + PGlite: контракт (labs/m13/acceptance), Outbox, Fault, таймаут, rate limit.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createNestApp } from './app.ts';

const require_ = createRequire(import.meta.url);
const { start } = require_('../../m12/soap-mock/mock.cjs') as { start: (p: number) => Promise<import('node:http').Server> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mock = await start(0);
const app = await createNestApp({ soapUrl: `http://127.0.0.1:${(mock.address() as { port: number }).port}/`, retryDelayMs: 20, timeoutMs: 200 });
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

const lim = await createNestApp({ rateLimit: 5 });
await lim.listen(0, '127.0.0.1');
const limBase = `http://127.0.0.1:${new URL(await lim.getUrl()).port}`;
const codes: number[] = [];
for (let i = 0; i < 7; i++) codes.push((await fetch(limBase + '/applications')).status);
if (!codes.slice(5).includes(429)) problems.push('rate limit не вернул 429: ' + codes.join(','));
await lim.close();

await app.close();
mock.closeAllConnections();
mock.close();
if (problems.length) { problems.forEach((p) => console.log('ПРОВАЛ ' + p)); process.exit(1); }
console.log('OK: NestJS + PGlite: контракт, Outbox, Fault, таймаут, ретраи, rate limit');
process.exit(0);
