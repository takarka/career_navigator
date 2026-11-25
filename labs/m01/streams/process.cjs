// Лаборатория: потоки и память.
// Скрипт считает строки и строки с уровнем ERROR в большом лог-файле и печатает JSON.
// Сейчас файл читается целиком в память. ЗАДАНИЕ: переделай на потоки (stream.pipeline + Transform),
// чтобы пиковая память не зависела от размера файла. Результат должен остаться тем же. Проверка: npm test
const fs = require('node:fs');

const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8'); // ← весь файл в памяти
let lines = 0;
let errors = 0;
for (const line of text.split('\n')) {
  if (!line) continue;
  lines++;
  if (line.includes(' ERROR ')) errors++;
}
console.log(JSON.stringify({ lines, errors, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024) }));
