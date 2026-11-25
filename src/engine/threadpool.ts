/**
 * Модель thread pool libuv для CPU-ёмких задач (например, crypto.pbkdf2).
 * Задачи берутся из очереди FIFO в свободные потоки пула. Если активных потоков больше, чем ядер CPU,
 * они делят ядра поровну (скорость каждой задачи = cores / active).
 * Модель не учитывает накладные расходы переключения и особенности планировщика ОС.
 */
export interface PoolInput {
  /** Число задач, поставленных одновременно. */
  tasks: number;
  /** Размер пула (UV_THREADPOOL_SIZE). */
  size: number;
  /** Число ядер CPU. */
  cores: number;
  /** Время одной задачи на выделенном ядре, мс. */
  duration: number;
}

export interface TaskRun {
  id: number;
  /** Номер потока пула, 0-based. */
  thread: number;
  start: number;
  finish: number;
}

export interface PoolResult {
  runs: TaskRun[];
  /** Момент завершения последней задачи. */
  total: number;
  /** Группы почти одновременно завершившихся задач («ступеньки»). */
  waves: number;
}

export function simulatePool({ tasks, size, cores, duration }: PoolInput): PoolResult {
  const remaining = new Map<number, number>(); // id -> оставшаяся работа в «ядро-мс»
  const threadOf = new Map<number, number>();
  const startOf = new Map<number, number>();
  const freeThreads: number[] = Array.from({ length: Math.max(1, size) }, (_, i) => i);
  const queue = Array.from({ length: tasks }, (_, i) => i);
  const runs: TaskRun[] = [];
  let t = 0;

  const fill = () => {
    while (freeThreads.length && queue.length) {
      const id = queue.shift()!;
      const th = freeThreads.shift()!;
      remaining.set(id, duration);
      threadOf.set(id, th);
      startOf.set(id, t);
    }
  };
  fill();

  while (remaining.size) {
    const active = remaining.size;
    const rate = Math.min(1, cores / active);
    let dt = Infinity;
    for (const r of remaining.values()) dt = Math.min(dt, r / rate);
    t += dt;
    for (const [id, r] of [...remaining]) {
      const left = r - dt * rate;
      if (left <= 1e-9) {
        remaining.delete(id);
        freeThreads.push(threadOf.get(id)!);
        freeThreads.sort((a, b) => a - b);
        runs.push({ id, thread: threadOf.get(id)!, start: startOf.get(id)!, finish: t });
      } else remaining.set(id, left);
    }
    fill();
  }

  runs.sort((a, b) => a.id - b.id);
  return { runs, total: t, waves: countWaves(runs.map((r) => r.finish), duration * 0.5) };
}

/** Считает «ступеньки»: соседние (по времени) завершения ближе, чем gap, относятся к одной группе. */
export function countWaves(finishes: number[], gap: number): number {
  const s = [...finishes].sort((a, b) => a - b);
  if (!s.length) return 0;
  let waves = 1;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > gap) waves++;
  return waves;
}
