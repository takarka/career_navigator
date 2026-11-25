// Решение: файл идёт потоком через pipeline, строки собираются Transform'ом, память не растёт с размером файла.
const fs = require('node:fs');
const { Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const file = process.argv[2];
let lines = 0;
let errors = 0;

class SplitLines extends Transform {
  constructor() {
    super({ readableObjectMode: true });
    this.tail = '';
  }
  _transform(chunk, enc, cb) {
    const parts = (this.tail + chunk.toString('utf8')).split('\n');
    this.tail = parts.pop();
    for (const p of parts) if (p) this.push(p);
    cb();
  }
  _flush(cb) {
    if (this.tail) this.push(this.tail);
    cb();
  }
}

const count = new Writable({
  objectMode: true,
  write(line, enc, cb) {
    lines++;
    if (line.includes(' ERROR ')) errors++;
    cb();
  },
});

pipeline(fs.createReadStream(file), new SplitLines(), count)
  .then(() => console.log(JSON.stringify({ lines, errors, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) })))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
