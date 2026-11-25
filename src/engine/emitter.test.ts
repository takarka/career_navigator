import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emitterScenarios, emitterSource, simulateEmitter } from './emitter.ts';

const dir = mkdtempSync(join(tmpdir(), 'emitter-'));
const runReal = (src: string, name: string): string[] => {
  const file = join(dir, `${name}.cjs`);
  writeFileSync(file, src);
  const out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return out ? out.split('\n') : [];
};

describe('модель EventEmitter совпадает с реальным Node', () => {
  for (const s of emitterScenarios) {
    it(s.id, () => expect(simulateEmitter(s.ops).log).toEqual(runReal(emitterSource(s.ops), s.id)));
  }

  it('дополнительные сценарии: off и порядок после снятия слушателя', () => {
    const ops = [
      { k: 'on', ev: 'a', id: 'A' },
      { k: 'on', ev: 'a', id: 'B' },
      { k: 'off', ev: 'a', id: 'A' },
      { k: 'emit', ev: 'a' },
      { k: 'emit', ev: 'b' },
    ] as const;
    expect(simulateEmitter([...ops]).log).toEqual(runReal(emitterSource([...ops]), 'off'));
  });

  it('предупреждение приходит один раз на событие и не раньше превышения лимита', () => {
    const lim = simulateEmitter([{ k: 'max', n: 3 }, ...['1', '2', '3'].map((id) => ({ k: 'on' as const, ev: 'x', id }))]);
    expect(lim.log).toEqual([]);
    const over = simulateEmitter([{ k: 'max', n: 3 }, ...['1', '2', '3', '4', '5'].map((id) => ({ k: 'on' as const, ev: 'x', id }))]);
    expect(over.log).toEqual(['warning: MaxListenersExceededWarning']);
  });

  it('кадры: у каждого шага есть заголовок, последний кадр содержит весь лог', () => {
    for (const s of emitterScenarios) {
      const { frames, log } = simulateEmitter(s.ops);
      expect(frames.every((f) => f.title.length > 0)).toBe(true);
      expect(frames[frames.length - 1].log).toEqual(log);
    }
  });
});
