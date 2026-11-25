// Автотест: после N завершённых запросов /wait число слушателей 'tick' не должно расти.
// Запуск: npm test            (проверяет server.cjs)
//         npm test -- solution (проверяет эталонное решение)
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const target = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'server.cjs') : path.join(__dirname, 'server.cjs');
const N = 30;
const LIMIT = 3; // допускаем слушателей «в полёте»

const get = (port, p) =>
  new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });

(async () => {
  const child = spawn(process.execPath, [target], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let warned = false;
  child.stderr.on('data', (d) => { if (String(d).includes('MaxListenersExceededWarning')) warned = true; });
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }));
  let failed = false;
  try {
    for (let i = 0; i < N; i++) await get(port, '/wait');
    await new Promise((r) => setTimeout(r, 100));
    const count = Number(await get(port, '/listeners'));
    console.log(`после ${N} запросов слушателей 'tick': ${count} (лимит ${LIMIT}); предупреждение MaxListeners: ${warned ? 'да' : 'нет'}`);
    if (count > LIMIT) {
      console.log('ПРОВАЛ: слушатели не снимаются — это утечка.');
      failed = true;
    } else console.log('OK');
  } finally {
    child.kill();
  }
  process.exit(failed ? 1 : 0);
})();
