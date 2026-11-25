import { percentile } from './chart.ts';

/**
 * Модель сервера с одним потоком обработки и необязательным пулом воркеров для тяжёлых запросов.
 * Лёгкие запросы всегда обрабатываются в главном потоке по очереди (FIFO).
 * Тяжёлые: при workers = 0 считаются в главном потоке и блокируют всех; при workers > 0 главный поток тратит
 * на передачу задачи dispatchMs, а считает воркер (очередь воркеров тоже FIFO).
 * Это упрощённая модель: без накладных расходов на передачу данных и без разделения ядер между воркерами.
 */
export interface ServerInput {
  /** Средняя интенсивность входящих запросов, запросов в секунду. */
  rps: number;
  /** Доля тяжёлых запросов, 0..1. */
  heavyShare: number;
  lightMs: number;
  heavyMs: number;
  workers: number;
  seconds: number;
  seed: number;
  dispatchMs?: number;
}

export interface Req {
  at: number;
  heavy: boolean;
  latency: number;
}

export interface ServerResult {
  reqs: Req[];
  light: { p50: number; p95: number };
  heavy: { p50: number; p95: number };
  /** Максимальная длина очереди к главному потоку. */
  maxQueue: number;
}

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
}

export function simulateServer(i: ServerInput): ServerResult {
  const rand = rng(i.seed);
  const dispatch = i.dispatchMs ?? 0.5;
  const arrivals: { at: number; heavy: boolean }[] = [];
  let t = 0;
  for (;;) {
    t += (-Math.log(rand()) / i.rps) * 1000;
    if (t > i.seconds * 1000) break;
    arrivals.push({ at: t, heavy: rand() < i.heavyShare });
  }

  let mainFree = 0;
  const workerFree = Array.from({ length: i.workers }, () => 0);
  const reqs: Req[] = [];
  const mainFinish: number[] = [];
  for (const a of arrivals) {
    const start = Math.max(a.at, mainFree);
    let end: number;
    if (!a.heavy) {
      end = start + i.lightMs;
      mainFree = end;
    } else if (i.workers === 0) {
      end = start + i.heavyMs;
      mainFree = end;
    } else {
      mainFree = start + dispatch;
      const k = workerFree.indexOf(Math.min(...workerFree));
      const wStart = Math.max(mainFree, workerFree[k]);
      end = wStart + i.heavyMs;
      workerFree[k] = end;
    }
    mainFinish.push(mainFree);
    reqs.push({ at: a.at, heavy: a.heavy, latency: end - a.at });
  }

  // длина очереди к главному потоку в момент каждого прихода: сколько запросов ещё не освободили главный поток
  let maxQueue = 0;
  for (let k = 0; k < arrivals.length; k++) {
    let q = 0;
    for (let j = k - 1; j >= 0 && mainFinish[j] > arrivals[k].at; j--) q++;
    maxQueue = Math.max(maxQueue, q);
  }

  const stat = (h: boolean) => {
    const v = reqs.filter((r) => r.heavy === h).map((r) => r.latency);
    return { p50: v.length ? percentile(v, 50) : 0, p95: v.length ? percentile(v, 95) : 0 };
  };
  return { reqs, light: stat(false), heavy: stat(true), maxQueue };
}
