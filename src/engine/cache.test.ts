import { describe, expect, it } from 'vitest';
import { simulateCache, type CacheInput } from './cache.ts';

const base: CacheInput = { rps: 200, seconds: 20, ttlMs: 5000, dbMs: 300, protection: 'none', seed: 4 };

describe('cache-aside и давка (stampede)', () => {
  it('без защиты при истечении TTL десятки запросов одновременно идут в БД', () => {
    const r = simulateCache(base);
    expect(r.peakDb).toBeGreaterThan(20);
    expect(r.dbCalls).toBeGreaterThan(60);
  });

  it('single-flight: пересборку делает один запрос за цикл', () => {
    const r = simulateCache({ ...base, protection: 'single-flight' });
    expect(r.peakDb).toBe(1);
    expect(r.dbCalls).toBeLessThanOrEqual(Math.ceil(base.seconds * 1000 / (base.ttlMs + base.dbMs)) + 1);
  });

  it('stale-while-revalidate тоже сводит число обращений к минимуму и держит высокий hit ratio', () => {
    const r = simulateCache({ ...base, protection: 'stale' });
    expect(r.peakDb).toBe(1);
    expect(r.hitRatio).toBeGreaterThan(simulateCache({ ...base, protection: 'single-flight' }).hitRatio);
  });

  it('больший TTL — выше hit ratio и меньше обращений к БД', () => {
    const a = simulateCache({ ...base, protection: 'single-flight', ttlMs: 1000 });
    const b = simulateCache({ ...base, protection: 'single-flight', ttlMs: 10000 });
    expect(b.dbCalls).toBeLessThan(a.dbCalls);
    expect(b.hitRatio).toBeGreaterThan(a.hitRatio);
  });

  it('воспроизводимость и корректность счётчиков', () => {
    const r = simulateCache(base);
    expect(r).toEqual(simulateCache(base));
    expect(r.hits).toBeLessThanOrEqual(r.requests);
    expect(r.dbPerSecond.reduce((s, x) => s + x, 0)).toBe(r.dbCalls);
  });
});
