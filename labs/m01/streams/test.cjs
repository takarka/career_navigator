// Автотест: результат верный и пиковая память мала (файл ~64 МБ).
// Запуск: npm test            (проверяет process.cjs)
//         npm test -- solution (проверяет эталонное решение)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const target = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'process.cjs') : path.join(__dirname, 'process.cjs');
const LINES = 900000;
const MAX_RSS_MB = Number(process.env.MAX_RSS_MB ?? 110);

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'streams-lab-')), 'app.log');
let expectedErrors = 0;
const fd = fs.openSync(file, 'w');
let buf = [];
for (let i = 0; i < LINES; i++) {
  const level = i % 7 === 0 ? 'ERROR' : i % 3 === 0 ? 'WARN' : 'INFO';
  if (level === 'ERROR') expectedErrors++;
  buf.push(`2026-01-01T00:00:00.000Z ${level} request ${i} completed with some details to make the line longer ................`);
  if (buf.length === 20000) {
    fs.writeSync(fd, buf.join('\n') + '\n');
    buf = [];
  }
}
if (buf.length) fs.writeSync(fd, buf.join('\n') + '\n');
fs.closeSync(fd);

const sizeMb = Math.round(fs.statSync(file).size / 1024 / 1024);
let failed = false;
try {
  const out = JSON.parse(execFileSync(process.execPath, [target, file], { encoding: 'utf8' }));
  console.log(`файл ${sizeMb} МБ; строк: ${out.lines}, ERROR: ${out.errors}; пиковая память процесса: ${out.maxRssMb} МБ (лимит ${MAX_RSS_MB} МБ)`);
  if (out.lines !== LINES || out.errors !== expectedErrors) {
    console.log(`ПРОВАЛ: неверный результат (ожидалось строк ${LINES}, ERROR ${expectedErrors})`);
    failed = true;
  } else if (out.maxRssMb > MAX_RSS_MB) {
    console.log('ПРОВАЛ: пиковая память слишком велика: файл не должен целиком попадать в память. Используй потоки.');
    failed = true;
  } else console.log('OK');
} finally {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
