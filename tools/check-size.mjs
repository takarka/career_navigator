// Бюджет размера: JS, который грузится на главной (script + modulepreload из dist/index.html).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const LIMIT_KB = Number(process.env.START_JS_LIMIT_KB ?? 250);
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = new Set();
for (const m of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)) files.add(m[1]);

let total = 0;
for (const f of files) {
  const kb = statSync(join(dist, f)).size / 1024;
  total += kb;
  console.log(`  ${f}  ${kb.toFixed(1)} КБ`);
}
console.log(`Стартовый JS: ${total.toFixed(1)} КБ (лимит ${LIMIT_KB} КБ)`);
if (total > LIMIT_KB) {
  console.error('FAIL: превышен бюджет стартового JS');
  process.exit(1);
}
