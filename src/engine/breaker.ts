/**
 * Circuit breaker: closed → open (после failureThreshold подряд ошибок) → half-open (после openMs) → closed (успех) или снова open (ошибка).
 * Время виртуальное (мс). Пока автомат открыт, вызовы не доходят до зависимости: быстрый отказ вместо долгого ожидания.
 */
export type BState = 'closed' | 'open' | 'half-open';

export interface BreakerCfg {
  failureThreshold: number;
  openMs: number;
}

export class Breaker {
  state: BState = 'closed';
  private failures = 0;
  private openedAt = 0;
  constructor(private cfg: BreakerCfg) {}

  /** Выполнить вызов в момент now. dep возвращает true при успехе. Результат: 'ok' | 'fail' | 'rejected' (быстрый отказ). */
  call(now: number, dep: () => boolean): 'ok' | 'fail' | 'rejected' {
    if (this.state === 'open') {
      if (now - this.openedAt >= this.cfg.openMs) this.state = 'half-open';
      else return 'rejected';
    }
    const ok = dep();
    if (ok) {
      this.failures = 0;
      this.state = 'closed';
      return 'ok';
    }
    this.failures++;
    if (this.state === 'half-open' || this.failures >= this.cfg.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
    }
    return 'fail';
  }
}
