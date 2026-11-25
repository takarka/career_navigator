// Автотест: запрос в процессе должен получить ответ 200, процесс — завершиться с кодом 0, новые соединения — отклоняться.
// Запуск: npm test            (проверяет server.cjs)
//         npm test -- solution (проверяет эталонное решение)
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const target = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'server.cjs') : path.join(__dirname, 'server.cjs');

const request = (port, p) =>
  new Promise((resolve) => {
    http
      .get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode, body }));
        res.on('error', (e) => resolve({ error: e.code ?? e.message }));
      })
      .on('error', (e) => resolve({ error: e.code ?? e.message }));
  });

(async () => {
  const child = spawn(process.execPath, [target], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }));
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

  const inFlight = request(port, '/slow');
  await new Promise((r) => setTimeout(r, 60));
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 60));
  const late = await request(port, '/'); // новое соединение уже после SIGTERM
  const res = await inFlight;
  const exit = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 4000))]);
  if (exit.code === 'timeout') child.kill('SIGKILL');

  console.log(`ответ на запрос в процессе: ${res.error ? 'ОШИБКА ' + res.error : res.status + ' ' + res.body}`);
  console.log(`новое соединение после SIGTERM: ${late.error ? 'отклонено (' + late.error + ')' : 'принято (' + late.status + ')'}`);
  console.log(`завершение процесса: код=${exit.code} сигнал=${exit.signal ?? '-'}`);

  const problems = [];
  if (res.error || res.status !== 200 || res.body !== 'done') problems.push('запрос в процессе должен завершиться ответом 200 done, а он оборван');
  if (exit.code !== 0) problems.push('процесс должен завершиться сам с кодом 0 (а не быть убитым сигналом)');
  if (!late.error) problems.push('после SIGTERM новые соединения не должны приниматься');
  if (problems.length) {
    problems.forEach((p) => console.log('ПРОВАЛ: ' + p));
    process.exit(1);
  }
  console.log('OK');
})();
