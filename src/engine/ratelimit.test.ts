import { describe, expect, it } from 'vitest';
import { decide, patterns } from './ratelimit.ts';

const allowed = (d: boolean[]) => d.filter(Boolean).length;
const L = { limit: 10, windowMs: 1000 };

describe('rate limiting', () => {
  it('фиксированное окно пропускает до 2×limit за короткий интервал на границе окон', () => {
    const times = patterns.boundary.times(L.limit, L.windowMs);
    expect(allowed(decide('fixed', L, times))).toBe(20);
    // все 20 запросов уложились в 200 мс: фактически 20 запросов за 0.2 с при лимите 10 за секунду
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(400);
  });

  it('скользящий журнал не допускает больше limit запросов в любом окне длиной window', () => {
    const times = patterns.boundary.times(L.limit, L.windowMs);
    const d = decide('sliding-log', L, times);
    const ok = times.filter((_, i) => d[i]);
    for (const t of ok) expect(ok.filter((x) => x > t - L.windowMs && x <= t).length).toBeLessThanOrEqual(L.limit);
    expect(allowed(d)).toBe(10);
  });

  it('скользящий счётчик отсекает всплеск на границе окон (приближённо)', () => {
    const d = decide('sliding-counter', L, patterns.boundary.times(L.limit, L.windowMs));
    expect(allowed(d)).toBeLessThan(20);
    expect(allowed(d)).toBeGreaterThanOrEqual(10);
  });

  it('token bucket допускает всплеск до ёмкости и затем ограничивает скоростью пополнения', () => {
    const d = decide('token-bucket', L, patterns.burst.times(L.limit, L.windowMs));
    expect(d.slice(0, 10).every(Boolean)).toBe(true); // всплеск в пределах корзины
    expect(d.slice(10).some((x) => !x)).toBe(true); // дальше упираемся в скорость пополнения
  });

  it('token bucket пополняется со временем', () => {
    const d = decide('token-bucket', { limit: 2, windowMs: 1000 }, [0, 0, 0, 500, 1000]);
    expect(d).toEqual([true, true, false, true, true]);
  });

  it('пустой поток не ломает алгоритмы', () => {
    for (const a of ['fixed', 'sliding-log', 'sliding-counter', 'token-bucket'] as const) expect(decide(a, L, [])).toEqual([]);
  });
});
