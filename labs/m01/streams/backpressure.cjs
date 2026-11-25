// Лаборатория: backpressure.
// Медленный Writable (каждая запись завершается на следующем витке цикла) и быстрый производитель.
// Запуск: node backpressure.cjs [--ignore] [--hwm=4] [--total=100] [--per-tick=5] [--json]
// С флагом --ignore производитель игнорирует результат write() и не ждёт drain: буфер растёт.
const { Writable } = require('node:stream');

const arg = (name, def) => Number((process.argv.find((a) => a.startsWith(`--${name}=`)) ?? '').split('=')[1] ?? def) || def;
const respect = !process.argv.includes('--ignore');
const hwm = arg('hwm', 4);
const total = arg('total', 100);
const perTick = arg('per-tick', 5);
const json = process.argv.includes('--json');

let written = 0, maxLen = 0, processed = 0, drains = 0;
const w = new Writable({
  objectMode: true,
  highWaterMark: hwm,
  write(chunk, enc, cb) {
    setImmediate(() => { processed++; cb(); });
  },
});
w.on('drain', () => drains++);

const produce = () => {
  for (let i = 0; i < perTick && written < total; i++) {
    const ok = w.write({ n: written++ });
    maxLen = Math.max(maxLen, w.writableLength);
    if (!ok && respect) {
      w.once('drain', produce); // ждём, пока приёмник разберёт буфер
      return;
    }
  }
  if (written < total) setImmediate(produce);
  else w.end();
};

w.on('finish', () => {
  if (json) console.log(JSON.stringify({ maxBuffered: maxLen, processed, drains }));
  else console.log(`режим: ${respect ? 'учитываем drain' : 'игнорируем write()'}; highWaterMark=${hwm}; макс. элементов в буфере: ${maxLen}; обработано: ${processed}; событий drain: ${drains}`);
});
produce();
