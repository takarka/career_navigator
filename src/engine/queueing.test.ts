import { describe, expect, it } from 'vitest';
import { curve, mmc, simulateMMc } from './queueing.ts';

describe('теория очередей', () => {
  it('M/M/1: λ=8, μ=10 → ρ=0.8, W=0.5, L=4', () => {
    const r = mmc({ lambda: 8, mu: 10, servers: 1 });
    expect(r.rho).toBeCloseTo(0.8);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.l).toBeCloseTo(4);
    expect(r.pWait).toBeCloseTo(0.8); // для одного сервера P(ожидание) = ρ
  });

  it('M/M/2: λ=1, μ=1 → P(ожидание)=1/3, Wq=1/3', () => {
    const r = mmc({ lambda: 1, mu: 1, servers: 2 });
    expect(r.pWait).toBeCloseTo(1 / 3);
    expect(r.wq).toBeCloseTo(1 / 3);
    expect(r.w).toBeCloseTo(4 / 3);
  });

  it('при ρ ≥ 1 очередь растёт бесконечно', () => {
    expect(mmc({ lambda: 10, mu: 10, servers: 1 }).stable).toBe(false);
    expect(mmc({ lambda: 20, mu: 10, servers: 1 }).w).toBe(Infinity);
  });

  it('закон Литтла L = λ·W выполняется', () => {
    for (const s of [1, 2, 4]) {
      const r = mmc({ lambda: 0.7 * s * 5, mu: 5, servers: s });
      expect(r.l).toBeCloseTo(0.7 * s * 5 * r.w, 9);
    }
  });

  it('оракул: формулы совпадают с имитацией очереди (допуск 6%)', () => {
    for (const q of [{ lambda: 5, mu: 10, servers: 1 }, { lambda: 8, mu: 10, servers: 1 }, { lambda: 15, mu: 10, servers: 2 }, { lambda: 30, mu: 10, servers: 4 }]) {
      const f = mmc(q);
      const s = simulateMMc(q, 400000, 7);
      expect(Math.abs(s.w - f.w) / f.w, JSON.stringify(q)).toBeLessThan(0.06);
    }
  });

  it('задержка растёт нелинейно с загрузкой: при ρ=0.9 в разы выше, чем при ρ=0.5', () => {
    const lo = mmc({ lambda: 5, mu: 10, servers: 1 }).w;
    const hi = mmc({ lambda: 9, mu: 10, servers: 1 }).w;
    expect(hi / lo).toBeGreaterThan(4);
  });

  it('кривая монотонно растёт', () => {
    const c = curve(10, 1);
    for (let i = 1; i < c.length; i++) expect(c[i].w).toBeGreaterThan(c[i - 1].w);
  });
});
