import { rng } from './serversim.ts';

/**
 * Расписание повторов: экспоненциальная задержка с потолком и jitter.
 * delay(n) = min(max, base * factor^n); jitter: none — как есть; full — равномерно в [0, delay];
 * equal — delay/2 + равномерно в [0, delay/2].
 */
export type Jitter = 'none' | 'full' | 'equal';

export interface RetryPlan {
  base: number;
  factor: number;
  max: number;
  attempts: number;
  jitter: Jitter;
  seed: number;
}

export function backoffSchedule(p: RetryPlan): number[] {
  const rand = rng(p.seed);
  return Array.from({ length: p.attempts }, (_, n) => {
    const d = Math.min(p.max, p.base * p.factor ** n);
    if (p.jitter === 'full') return Math.round(rand() * d);
    if (p.jitter === 'equal') return Math.round(d / 2 + (rand() * d) / 2);
    return Math.round(d);
  });
}

/** Тип ошибки определяет судьбу сообщения: временные повторяют, постоянные сразу в DLQ. */
export type ErrorKind = 'transient' | 'permanent';

export function decide(kind: ErrorKind, attempt: number, maxAttempts: number): 'retry' | 'dlq' {
  if (kind === 'permanent') return 'dlq';
  return attempt + 1 >= maxAttempts ? 'dlq' : 'retry';
}
