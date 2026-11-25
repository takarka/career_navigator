import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { simulateBackpressure } from './backpressure.ts';

const script = join(import.meta.dirname, '..', '..', 'labs', 'm01', 'streams', 'backpressure.cjs');
const real = (p: { total: number; perTick: number; hwm: number; respect: boolean }) =>
  JSON.parse(execFileSync(process.execPath, [script, '--json', `--total=${p.total}`, `--per-tick=${p.perTick}`, `--hwm=${p.hwm}`, ...(p.respect ? [] : ['--ignore'])], { encoding: 'utf8' })) as { maxBuffered: number; processed: number; drains: number };

describe('модель backpressure', () => {
  it('при учёте drain буфер не превышает highWaterMark', () => {
    const r = simulateBackpressure({ total: 100, perTick: 5, highWaterMark: 4, respect: true });
    expect(r.maxBuffered).toBe(4);
    expect(r.processed).toBe(100);
  });

  it('при игнорировании буфер растёт почти до общего числа элементов', () => {
    const r = simulateBackpressure({ total: 100, perTick: 5, highWaterMark: 4, respect: false });
    expect(r.maxBuffered).toBe(81);
    expect(r.drains).toBe(0);
  });

  it('кадры заканчиваются, когда всё обработано', () => {
    const r = simulateBackpressure({ total: 20, perTick: 3, highWaterMark: 4, respect: true });
    expect(r.frames[r.frames.length - 1].processed).toBe(20);
    expect(r.frames[0].iteration).toBe(1);
  });
});

describe('оракул: backpressure в реальном Node', () => {
  const cases = [
    { total: 100, perTick: 5, hwm: 2 },
    { total: 100, perTick: 5, hwm: 4 },
    { total: 100, perTick: 5, hwm: 8 },
    { total: 60, perTick: 3, hwm: 16 },
    { total: 50, perTick: 10, hwm: 3 },
  ];
  for (const c of cases) {
    for (const respect of [true, false]) {
      it(`total=${c.total} perTick=${c.perTick} hwm=${c.hwm} ${respect ? 'учёт drain' : 'игнор'}`, () => {
        const r = real({ ...c, respect });
        const m = simulateBackpressure({ total: c.total, perTick: c.perTick, highWaterMark: c.hwm, respect });
        expect({ maxBuffered: m.maxBuffered, processed: m.processed, drains: m.drains }).toEqual(r);
      });
    }
  }
});
