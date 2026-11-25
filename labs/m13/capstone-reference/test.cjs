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
  // WebSocket: клиент получает событие о смене статуса
  const events = [];
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  ws.onmessage = (e) => events.push(JSON.parse(e.data));
  await new Promise((r) => { ws.onopen = r; ws.onerror = r; });
  const a = await post({ title: 'ok', payload: { requestId: 42 } }, 'k1');
  if (!(await waitStatus(a.id, 'ACCEPTED'))) problems.push('заявка с requestId=42 не стала ACCEPTED');
  const b = await post({ title: 'fault', payload: { requestId: 0 } }, 'k2');
  if (!(await waitStatus(b.id, 'REJECTED'))) problems.push('Fault не привёл к REJECTED');
  const c = await post({ title: 'slow', payload: { requestId: 'slow' } }, 'k3');
  if (!(await waitStatus(c.id, 'FAILED'))) problems.push('таймаут не привёл к FAILED после ретраев');
  await sleep(100);
  if (!events.some((e) => e.id === a.id && e.status === 'ACCEPTED')) problems.push('WebSocket не прислал событие ACCEPTED: ' + JSON.stringify(events));
  ws.close();
  const jobs = app.db.prepare('SELECT COUNT(*) n FROM outbox WHERE done = 0').get().n;
  if (jobs !== 0) problems.push(`в outbox остались невыполненные записи: ${jobs}`);

  const acc = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['test.cjs'], { cwd: path.join(__dirname, '..', 'acceptance'), env: { ...process.env, BASE_URL: base } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (status) => resolve({ status, stdout: out }));
  });
  if (acc.status !== 0) problems.push('приёмочные тесты контракта не прошли:\n' + acc.stdout);

  // rate limit: 6-й запрос за секунду получает 429
  const lim = createApp({ rateLimit: 5 });
  await new Promise((r) => lim.server.listen(0, '127.0.0.1', r));
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await fetch(`http://127.0.0.1:${lim.server.address().port}/applications`)).status);
  if (!codes.slice(5).includes(429)) problems.push('rate limit не вернул 429: ' + codes.join(','));
  lim.server.close(); lim.close();

  // graceful shutdown: SIGTERM -> процесс завершается с кодом 0
  const child = spawn(process.execPath, ['server.cjs'], { cwd: __dirname, env: { ...process.env, PORT: '39871', NODE_NO_WARNINGS: '1' } });
  for (let i = 0; i < 50; i++) { try { await fetch('http://127.0.0.1:39871/applications'); break; } catch { await sleep(100); } }
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  child.kill('SIGTERM');
  const code = await Promise.race([exited, sleep(3000).then(() => 'timeout')]);
  if (code !== 0) { problems.push('SIGTERM: код выхода ' + code); child.kill('SIGKILL'); }

  app.server.close(); app.close(); mock.closeAllConnections(); mock.close();
  if (problems.length) { problems.forEach((p) => console.log('ПРОВАЛ ' + p)); process.exit(1); }
  console.log('OK: контракт, Outbox, Fault, таймаут, ретраи, rate limit, graceful shutdown, WebSocket');
  process.exit(0);
})();
