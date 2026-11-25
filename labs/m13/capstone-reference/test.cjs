// Проверка эталона: приёмка контракта + интеграция через Outbox с SOAP-мок (статусы, Fault, повторы).
const { createApp } = require('./server.cjs');
const { start } = require('../../m12/soap-mock/mock.cjs');
const { spawn } = require('node:child_process');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const mock = await start(0);
  const app = createApp({ soapUrl: `http://127.0.0.1:${mock.address().port}/`, retryDelayMs: 20, timeoutMs: 200 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (body, key) => (await fetch(base + '/applications', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) })).json();
  const get = async (id) => (await fetch(`${base}/applications/${id}`)).json();
  const waitStatus = async (id, want) => { for (let i = 0; i < 100; i++) { if ((await get(id)).status === want) return true; await sleep(30); } return false; };

  const problems = [];
  const a = await post({ title: 'ok', payload: { requestId: 42 } }, 'k1');
  if (!(await waitStatus(a.id, 'ACCEPTED'))) problems.push('заявка с requestId=42 не стала ACCEPTED');
  const b = await post({ title: 'fault', payload: { requestId: 0 } }, 'k2');
  if (!(await waitStatus(b.id, 'REJECTED'))) problems.push('Fault не привёл к REJECTED');
  const c = await post({ title: 'slow', payload: { requestId: 'slow' } }, 'k3');
  if (!(await waitStatus(c.id, 'FAILED'))) problems.push('таймаут не привёл к FAILED после ретраев');
  const jobs = app.db.prepare('SELECT COUNT(*) n FROM outbox WHERE done = 0').get().n;
  if (jobs !== 0) problems.push(`в outbox остались невыполненные записи: ${jobs}`);

  const acc = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['test.cjs'], { cwd: path.join(__dirname, '..', 'acceptance'), env: { ...process.env, BASE_URL: base } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (status) => resolve({ status, stdout: out }));
  });
  if (acc.status !== 0) problems.push('приёмочные тесты контракта не прошли:\n' + acc.stdout);

  app.close(); mock.closeAllConnections(); mock.close();
  if (problems.length) { problems.forEach((p) => console.log('ПРОВАЛ ' + p)); process.exit(1); }
  console.log('OK: контракт, Outbox, Fault, таймаут и ретраи');
  process.exit(0);
})();
