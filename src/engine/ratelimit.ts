/**
 * Алгоритмы ограничения частоты запросов. Время в мс. Функции чистые: на вход — моменты запросов,
 * на выход — решения (true — пропущен). Те же алгоритмы реализуются на Redis (INCR + EXPIRE, ZADD + ZREMRANGEBYSCORE, Lua).
 */
export type Algo = 'fixed' | 'sliding-log' | 'sliding-counter' | 'token-bucket';

export interface Limits {
  /** Сколько запросов разрешено за окно (для token-bucket — ёмкость корзины). */
  limit: number;
  windowMs: number;
}

export function decide(algo: Algo, { limit, windowMs }: Limits, times: number[]): boolean[] {
  switch (algo) {
    case 'fixed': {
      // счётчик на окно [k*window, (k+1)*window)
      const counts = new Map<number, number>();
      return times.map((t) => {
        const w = Math.floor(t / windowMs);
        const n = (counts.get(w) ?? 0) + 1;
        if (n > limit) return false;
        counts.set(w, n);
        return true;
      });
    }
    case 'sliding-log': {
      // храним времена принятых запросов; считаем те, что внутри (t - window, t]
      const log: number[] = [];
      return times.map((t) => {
        while (log.length && log[0] <= t - windowMs) log.shift();
        if (log.length >= limit) return false;
        log.push(t);
        return true;
      });
    }
    case 'sliding-counter': {
      // приближение: счётчик текущего окна + доля счётчика предыдущего окна, пропорциональная перекрытию
      const counts = new Map<number, number>();
      return times.map((t) => {
        const w = Math.floor(t / windowMs);
        const frac = (t % windowMs) / windowMs;
        const est = (counts.get(w - 1) ?? 0) * (1 - frac) + (counts.get(w) ?? 0);
        if (est + 1 > limit) return false;
        counts.set(w, (counts.get(w) ?? 0) + 1);
        return true;
      });
    }
    case 'token-bucket': {
      // корзина ёмкостью limit, пополняется со скоростью limit за window; запрос забирает один токен
      let tokens = limit;
      let last = times[0] ?? 0;
      return times.map((t) => {
        tokens = Math.min(limit, tokens + ((t - last) / windowMs) * limit);
        last = t;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
      });
    }
  }
}

export const algoLabel: Record<Algo, string> = {
  fixed: 'Фиксированное окно (INCR + EXPIRE)',
  'sliding-log': 'Скользящее окно, журнал (sorted set)',
  'sliding-counter': 'Скользящее окно, счётчик (два окна)',
  'token-bucket': 'Token bucket',
};

export const patterns: Record<string, { label: string; times: (limit: number, windowMs: number) => number[] }> = {
  boundary: {
    label: 'Всплеск на границе окон',
    times: (limit, w) => [...Array.from({ length: limit }, (_, i) => w - 200 + i * 10), ...Array.from({ length: limit }, (_, i) => w + i * 10)],
  },
  steady: { label: 'Равномерный поток чуть выше лимита', times: (limit, w) => Array.from({ length: limit * 3 }, (_, i) => Math.round((i * w) / (limit * 0.8))) },
  burst: { label: 'Один большой всплеск', times: (limit) => Array.from({ length: limit * 2 }, (_, i) => i * 5) },
};
