/**
 * Записывает РЕАЛЬНЫЙ вывод Node.js для детерминированных сценариев event loop.
 * Эти трассы — эталонные ответы для игры «угадай вывод» (PredictGame).
 * Запуск: npm run record:traces
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toSource } from '../src/engine/eventloop.ts';
import { scenarios } from '../src/content/m01/scenarios.ts';

const dir = mkdtempSync(join(tmpdir(), 'traces-'));
const out: Record<string, string[]> = {};
for (const s of scenarios.filter((x) => x.deterministic)) {
  const file = join(dir, `${s.id}.cjs`);
  writeFileSync(file, toSource(s.ops));
  out[s.id] = execFileSync(process.execPath, [file], { encoding: 'utf8' }).trim().split('\n');
}
const target = join(import.meta.dirname, '..', 'src', 'content', 'm01', 'traces.json');
writeFileSync(target, JSON.stringify({ node: process.version, traces: out }, null, 2) + '\n');
console.log(`Записано трасс: ${Object.keys(out).length} (Node ${process.version}) → ${target}`);
