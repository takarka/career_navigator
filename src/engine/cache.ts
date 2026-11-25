import { rng } from './serversim.ts';

/**
 * Модель cache-aside для одного «горячего» ключа: что происходит в момент истечения TTL.
 * Запросы приходят потоком; при промахе клиент идёт в БД (запрос занимает dbMs) и кладёт значение в кэш на ttlMs.
 * Режимы защиты от «давки» (cache stampede):
 *  - none: каждый промах — отдельный поход в БД, пока значение не вернулось;
 *  - single-flight: пока один запрос перестраивает значение, остальные ждут его результат (блокировка пересборки);
 *  - stale: пока идёт пересборка, отдаём устаревшее значение (stale-while-revalidate).
 */
export type Protection = 'none' | 'single-flight' | 'stale';

export interface CacheInput {
  rps: number;
  seconds: number;
  ttlMs: number;
  dbMs: number;
  protection: Protection;
  seed: number;
}

export interface CacheResult {
  requests: number;
  hits: number;
  dbCalls: number;
  /** Максимум одновременных запросов к БД. */
  peakDb: number;
  hitRatio: number;
  /** Число обращений к БД по секундам. */
  dbPerSecond: number[];
}

export function simulateCache(i: CacheInput): CacheResult {
  const rand = rng(i.seed);
  const times: number[] = [];
  for (let t = 0; ; ) {
    t += (-Math.log(rand()) / i.rps) * 1000;
    if (t > i.seconds * 1000) break;
    times.push(t);
  }
  let freshUntil = -1; // до какого момента значение свежо
  let hasValue = false;
  let rebuildDoneAt = -1; // когда закончится идущая пересборка
  let hits = 0;
  let dbCalls = 0;
  const dbPerSecond = Array.from({ length: i.seconds }, () => 0);
  const dbIntervals: [number, number][] = [];
  const startDb = (t: number) => {
    dbCalls++;
    dbPerSecond[Math.min(i.seconds - 1, Math.floor(t / 1000))]++;
    dbIntervals.push([t, t + i.dbMs]);
  };

  for (const t of times) {
    if (rebuildDoneAt >= 0 && t >= rebuildDoneAt) {
      freshUntil = rebuildDoneAt + i.ttlMs;
      hasValue = true;
      rebuildDoneAt = -1;
    }
    if (t < freshUntil) {
      hits++;
      continue;
    }
    // значение отсутствует или устарело
    if (i.protection === 'none') {
      startDb(t);
      if (rebuildDoneAt < 0) rebuildDoneAt = t + i.dbMs;
    } else if (rebuildDoneAt < 0) {
      startDb(t);
      rebuildDoneAt = t + i.dbMs;
    } else if (i.protection === 'stale' && hasValue) {
      hits++; // отдаём устаревшее, пока идёт пересборка
    }
    // single-flight: ждём результата идущей пересборки (в БД не ходим)
  }
  // пик одновременных обращений к БД
  let peak = 0;
  for (const [s] of dbIntervals) peak = Math.max(peak, dbIntervals.filter(([a, b]) => a <= s && s < b).length);
  return { requests: times.length, hits, dbCalls, peakDb: peak, hitRatio: times.length ? hits / times.length : 0, dbPerSecond };
}
