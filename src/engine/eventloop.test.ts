import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulate, toSource } from './eventloop.ts';
import { scenarios } from '../content/m01/scenarios.ts';

const dir = mkdtempSync(join(tmpdir(), 'loop-'));

function runReal(source: string, name: string): string[] {
  const file = join(dir, `${name}.cjs`);
  writeFileSync(file, source);
  return execFileSync(process.execPath, [file], { encoding: 'utf8' }).trim().split('\n');
}

describe('модель event loop совпадает с реальным Node', () => {
  for (const s of scenarios.filter((x) => x.deterministic)) {
    it(`${s.id}`, () => {
      const real = runReal(toSource(s.ops), s.id);
      const model = simulate(s.ops).log;
      expect(model).toEqual(real);
    });
  }

  it('nondeterministic-сценарий симулируется без ошибок и выводит обе строки', () => {
    const s = scenarios.find((x) => !x.deterministic)!;
    expect(simulate(s.ops).log.sort()).toEqual(['setImmediate', 'setTimeout']);
  });

  it('есть пошаговые кадры, и последний кадр содержит весь лог', () => {
    for (const s of scenarios) {
      const { frames, log } = simulate(s.ops);
      expect(frames.length).toBeGreaterThan(2);
      expect(frames[frames.length - 1].log).toEqual(log);
    }
  });
});

describe('записанные трассы (PredictGame)', () => {
  it('совпадают с моделью и содержат все детерминированные сценарии', async () => {
    const { default: file } = await import('../content/m01/traces.json');
    const det = scenarios.filter((x) => x.deterministic);
    expect(Object.keys(file.traces).sort()).toEqual(det.map((s) => s.id).sort());
    for (const s of det) expect((file.traces as Record<string, string[]>)[s.id]).toEqual(simulate(s.ops).log);
  });
});
