import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countWaves, simulatePool } from './threadpool.ts';

describe('модель thread pool', () => {
  const base = { tasks: 8, duration: 100 };

  it('размер 1: задачи идут по очереди, 8 ступенек', () => {
    const r = simulatePool({ ...base, size: 1, cores: 4 });
    expect(r.waves).toBe(8);
    expect(r.total).toBeCloseTo(800);
    expect(r.runs.map((x) => x.finish)).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });

  it('размер 4 на 4 ядрах: две ступеньки по 100 мс', () => {
    const r = simulatePool({ ...base, size: 4, cores: 4 });
    expect(r.waves).toBe(2);
    expect(r.total).toBeCloseTo(200);
  });

  it('размер 8 на 4 ядрах не быстрее размера 4: потоки делят ядра', () => {
    const r = simulatePool({ ...base, size: 8, cores: 4 });
    expect(r.total).toBeCloseTo(200);
    expect(r.waves).toBe(1);
  });

  it('размер 8 на 8 ядрах: все задачи завершаются вместе', () => {
    const r = simulatePool({ ...base, size: 8, cores: 8 });
    expect(r.total).toBeCloseTo(100);
    expect(r.waves).toBe(1);
  });

  it('потоки пула нумеруются и переиспользуются', () => {
    const r = simulatePool({ ...base, size: 2, cores: 4 });
    expect(new Set(r.runs.map((x) => x.thread))).toEqual(new Set([0, 1]));
    expect(r.total).toBeCloseTo(400);
  });

  it('countWaves', () => {
    expect(countWaves([10, 12, 11, 100, 101], 20)).toBe(2);
    expect(countWaves([], 5)).toBe(0);
  });
});

/** Оракул: общее время реального Node сверяется с моделью (допуск широкий: время зависит от машины). */
describe('оракул: thread pool против реального Node', () => {
  const script = join(import.meta.dirname, '..', '..', 'labs', 'm01', 'threadpool', 'pbkdf2.cjs');
  const run = (size: number, tasks = 8) => {
    const out = execFileSync(process.execPath, [script, String(tasks), '--json'], { encoding: 'utf8', env: { ...process.env, UV_THREADPOOL_SIZE: String(size) } });
    return JSON.parse(out) as { cores: number; finishes: number[] };
  };

  it(
    'общее время при размерах 1, 2, 4 согласуется с моделью',
    { retry: 2, timeout: 60000 },
    () => {
      const cores = availableParallelism();
      const single = run(1, 1);
      const d = single.finishes[0]; // время одной задачи на свободном ядре
      for (const size of [1, 2, 4]) {
        const real = run(size);
        const model = simulatePool({ tasks: 8, size, cores, duration: d });
        const realTotal = Math.max(...real.finishes);
        expect(realTotal / model.total, `size=${size} real=${realTotal} model=${model.total.toFixed(0)}`).toBeGreaterThan(0.6);
        expect(realTotal / model.total, `size=${size} real=${realTotal} model=${model.total.toFixed(0)}`).toBeLessThan(2.2); // на общих раннерах CI виртуальные ядра дают до ~1,75 от модели
      }
    },
  );

  it('размер пула 1 даёт ступенчатое (последовательное) завершение', { retry: 2, timeout: 60000 }, () => {
    const real = run(1, 4);
    const sorted = [...real.finishes].sort((a, b) => a - b);
    const d = sorted[0];
    // каждая следующая задача завершается примерно на d позже предыдущей
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(d * 0.4);
  });
});
