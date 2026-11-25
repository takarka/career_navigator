import { rng } from './serversim.ts';

/**
 * Теория очередей для оценки задержек: M/M/c (пуассоновский поток, экспоненциальное обслуживание, c серверов).
 * λ — интенсивность прихода, μ — интенсивность обслуживания одним сервером, ρ = λ / (c·μ) — загрузка.
 * Формулы проверяются имитацией очереди (queueing.test.ts). Реальные системы отличаются (неэкспоненциальное обслуживание, батчи).
 */
export interface QInput {
  lambda: number;
  mu: number;
  servers: number;
}

export interface QResult {
  rho: number;
  stable: boolean;
  /** Вероятность ожидания (Erlang C). */
  pWait: number;
  /** Среднее время ожидания в очереди. */
  wq: number;
  /** Среднее время в системе (ожидание + обслуживание). */
  w: number;
  /** Среднее число запросов в системе (закон Литтла: L = λ·W). */
  l: number;
}

export function mmc({ lambda, mu, servers: c }: QInput): QResult {
  const rho = lambda / (c * mu);
  if (rho >= 1) return { rho, stable: false, pWait: 1, wq: Infinity, w: Infinity, l: Infinity };
  const a = lambda / mu;
  let sum = 0;
  let term = 1; // a^k / k!
  for (let k = 0; k < c; k++) {
    sum += term;
    term *= a / (k + 1);
  }
  const top = term / (1 - rho); // a^c / c! / (1 - rho)
  const pWait = top / (sum + top);
  const wq = pWait / (c * mu - lambda);
  const w = wq + 1 / mu;
  return { rho, stable: true, pWait, wq, w, l: lambda * w };
}

/** Имитация очереди M/M/c (FIFO): возвращает средние wq и w по n запросам. Используется как оракул формул. */
export function simulateMMc({ lambda, mu, servers: c }: QInput, n: number, seed: number): { wq: number; w: number } {
  const rand = rng(seed);
  const exp = (rate: number) => -Math.log(rand()) / rate;
  const free = new Array(c).fill(0) as number[];
  let t = 0;
  let waitSum = 0;
  let sysSum = 0;
  for (let i = 0; i < n; i++) {
    t += exp(lambda);
    let k = 0;
    for (let j = 1; j < c; j++) if (free[j] < free[k]) k = j;
    const start = Math.max(t, free[k]);
    const service = exp(mu);
    free[k] = start + service;
    waitSum += start - t;
    sysSum += start - t + service;
  }
  return { wq: waitSum / n, w: sysSum / n };
}

/** Точка кривой «задержка против загрузки» для графика. */
export function curve(mu: number, servers: number, steps = 40): { rho: number; w: number }[] {
  return Array.from({ length: steps }, (_, i) => {
    const rho = ((i + 1) / (steps + 1)) * 0.985;
    return { rho, w: mmc({ lambda: rho * servers * mu, mu, servers }).w };
  });
}
