// Автотест лаборатории: пока выполняется /slow, /fast должен отвечать быстро.
// Запуск: npm test            (проверяет server.cjs)
//         npm test -- solution (проверяет эталонное решение)
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const target = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'server.cjs') : path.join(__dirname, 'server.cjs');
const LIMIT_MS = Number(process.env.FAST_LIMIT_MS ?? 120);
const SLOW_MS = 400;

function get(port, p) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(Number(process.hrtime.bigint() - t0) / 1e6));
    }).on('error', reject);
  });
}

(async () => {
  const child = spawn(process.execPath, [target], { env: { ...process.env, PORT: '0', SLOW_MS: String(SLOW_MS) }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve) => child.stdout.on('data', (d) => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }));
  let failed = false;
  try {
    await get(port, '/fast'); // прогрев
    const slow = get(port, '/slow');
    await new Promise((r) => setTimeout(r, 30)); // /slow уже занял сервер (или воркер)
    let worst = 0;
    const until = Date.now() + SLOW_MS;
    while (Date.now() < until) {
      worst = Math.max(worst, await get(port, '/fast'));
      await new Promise((r) => setTimeout(r, 15));
    }
    const slowMs = await slow;
    console.log(`худшая задержка /fast во время /slow: ${worst.toFixed(0)} мс (лимит ${LIMIT_MS} мс); /slow занял ${slowMs.toFixed(0)} мс`);
    if (worst > LIMIT_MS) {
      console.log('ПРОВАЛ: /fast ждёт, пока /slow занимает главный поток. Вынеси тяжёлую работу из главного потока.');
      failed = true;
    } else if (slowMs < SLOW_MS * 0.8) {
      console.log('ПРОВАЛ: /slow выполнился слишком быстро: работа не должна исчезать, её нужно только вынести.');
      failed = true;
    } else console.log('OK');
  } finally {
    child.kill();
  }
  process.exit(failed ? 1 : 0);
})();
