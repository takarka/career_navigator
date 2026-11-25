// Лаборатория: thread pool libuv.
// Запуск:   UV_THREADPOOL_SIZE=4 node pbkdf2.cjs
// Параметры (необязательно): node pbkdf2.cjs [число задач] [--json]
//
// 8 вызовов crypto.pbkdf2 уходят в thread pool. Размер пула задаёт, сколько из них выполняются одновременно.
// Запусти с UV_THREADPOOL_SIZE = 1, 4, 8 и запиши времена. Сравни с моделью в уроке.
const crypto = require('node:crypto');
const os = require('node:os');

const args = process.argv.slice(2);
const json = args.includes('--json');
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 8);
const size = process.env.UV_THREADPOOL_SIZE ?? '4 (по умолчанию)';

const start = Date.now();
const finishes = [];
let done = 0;
for (let i = 1; i <= N; i++) {
  crypto.pbkdf2('password', 'salt', 200000, 64, 'sha512', () => {
    const t = Date.now() - start;
    finishes.push(t);
    if (!json) console.log(`задача #${i} готова через ${t} мс`);
    if (++done === N && json) console.log(JSON.stringify({ size, cores: os.availableParallelism(), finishes }));
  });
}
if (!json) console.log(`UV_THREADPOOL_SIZE=${size}, ядер CPU: ${os.availableParallelism()}`);
