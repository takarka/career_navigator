/**
 * Снимает реальный CPU-профиль лаборатории labs/m10/profile/app.cjs через `node --cpu-prof` и сохраняет урезанную копию
 * (только нужные поля) в src/content/m10/sample.cpuprofile.json. Запуск: npm run gen:profile
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CpuProfile } from '../src/engine/cpuprofile.ts';

const root = join(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'sample-prof-'));
execFileSync(process.execPath, ['--cpu-prof', `--cpu-prof-dir=${dir}`, join(root, 'labs', 'm10', 'profile', 'app.cjs')], { stdio: 'inherit' });
const p = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')) as CpuProfile;
const slim: CpuProfile = {
  nodes: p.nodes.map((n) => ({ id: n.id, callFrame: { functionName: n.callFrame.functionName, url: n.callFrame.url.replace(/^file:\/\/.*\//, ''), lineNumber: n.callFrame.lineNumber }, ...(n.children ? { children: n.children } : {}) })),
  startTime: p.startTime,
  endTime: p.endTime,
  samples: p.samples,
  timeDeltas: p.timeDeltas,
};
const target = join(root, 'src', 'content', 'm10', 'sample.cpuprofile.json');
writeFileSync(target, JSON.stringify(slim) + '\n');
console.log(`Профиль: узлов ${slim.nodes.length}, сэмплов ${slim.samples.length} → ${target}`);
