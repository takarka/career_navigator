import { describe, expect, it } from 'vitest';
import { rng, simulateServer, type ServerInput } from './serversim.ts';

const base: ServerInput = { rps: 20, heavyShare: 0, lightMs: 5, heavyMs: 200, workers: 0, seconds: 30, seed: 7 };

describe('модель сервера', () => {
  it('генератор псевдослучайных чисел детерминирован и в диапазоне (0,1)', () => {
    const a = rng(1), b = rng(1);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('без тяжёлых запросов задержка близка к времени обработки', () => {
    const r = simulateServer(base);
    expect(r.light.p50).toBeGreaterThanOrEqual(5);
    expect(r.light.p50).toBeLessThan(15);
  });

  it('тяжёлые запросы в главном потоке портят задержку лёгких', () => {
    const r = simulateServer({ ...base, heavyShare: 0.05, rps: 10 });
    expect(r.light.p95).toBeGreaterThan(100);
  });

  it('вынос тяжёлых в воркеры возвращает лёгким нормальную задержку', () => {
    const blocking = simulateServer({ ...base, heavyShare: 0.05, rps: 10 });
    const fixed = simulateServer({ ...base, heavyShare: 0.05, rps: 10, workers: 2 });
    expect(fixed.light.p95).toBeLessThan(blocking.light.p95 / 5);
    expect(fixed.light.p95).toBeLessThan(40);
    expect(fixed.maxQueue).toBeLessThanOrEqual(blocking.maxQueue);
  });

  it('воркеры не спасают, если тяжёлой работы больше, чем они могут переварить', () => {
    // 10 запросов/с × 50% × 200 мс = 1 «ядро» работы на каждую секунду, одного воркера мало: очередь воркеров растёт
    const r = simulateServer({ ...base, heavyShare: 0.5, rps: 20, workers: 1 });
    expect(r.heavy.p95).toBeGreaterThan(1000);
  });

  it('результат воспроизводим при одинаковом seed', () => {
    expect(simulateServer({ ...base, heavyShare: 0.1 })).toEqual(simulateServer({ ...base, heavyShare: 0.1 }));
  });
});
