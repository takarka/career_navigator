// Автотест: после 300 000 запросов с уникальными ключами кэш не должен хранить больше 5 000 записей,
// а прирост используемой кучи должен быть небольшим. Для точных замеров нужен --expose-gc (тест перезапускается сам).
// Запуск: npm test            (твой service.cjs)
//         npm test -- solution (эталон)
const path = require('node:path');

if (typeof global.gc !== 'function') {
  const r = require('node:child_process').spawnSync(process.execPath, ['--expose-gc', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const svc = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'service.cjs') : path.join(__dirname, 'service.cjs'));
const N = 300000;
const LIMIT_ENTRIES = 5000;
const LIMIT_MB = 30;

global.gc();
const before = process.memoryUsage().heapUsed;
for (let i = 0; i < N; i++) svc.handle('key-' + i);
// горячий ключ должен по-прежнему работать (результат тот же)
const same = svc.handle('key-' + (N - 1)) === 'result-for-key-' + (N - 1) + '-' + 'x'.repeat(200);
global.gc();
const grownMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;

console.log(`записей в кэше: ${svc.size()} (лимит ${LIMIT_ENTRIES}); прирост кучи после GC: ${grownMb.toFixed(1)} МБ (лимит ${LIMIT_MB} МБ)`);
const problems = [];
if (svc.size() > LIMIT_ENTRIES) problems.push('кэш растёт без ограничения: добавь вытеснение (LRU/TTL) и верхнюю границу размера');
if (grownMb > LIMIT_MB) problems.push('куча заметно выросла после GC: объекты остаются достижимыми');
if (!same) problems.push('результат для ключа изменился');
if (problems.length) {
  problems.forEach((p) => console.log('ПРОВАЛ: ' + p));
  process.exit(1);
}
console.log('OK');
