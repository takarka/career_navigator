import { useMemo, useRef, useState } from 'preact/hooks';
import { MiniRedis, formatReply } from '../engine/miniredis.ts';
import { algoLabel, decide, patterns, type Algo } from '../engine/ratelimit.ts';
import { simulateCache, type Protection } from '../engine/cache.ts';
import { Chart } from './Chart.tsx';
import { toggle } from '../app/state.ts';

/* ---------- Терминал мини-Redis ---------- */
export const missions: Record<string, { text: string; check: (db: MiniRedis) => boolean }> = {
  counter: { text: 'Создай счётчик посещений: ключ `visits` должен содержать число 3 (используй INCR).', check: (db) => db.run('GET visits') === '3' },
  session: { text: 'Сохрани сессию: ключ `session:42` со значением `abc` и временем жизни не более 30 секунд.', check: (db) => db.run('GET session:42') === 'abc' && (db.run('TTL session:42') as number) > 0 && (db.run('TTL session:42') as number) <= 30 },
  lock: { text: 'Возьми блокировку: ключ `lock:report` со значением-токеном и TTL до 10 секунд, но только если ключа ещё нет (NX). Повторная попытка NX должна вернуть (nil).', check: (db) => typeof db.run('GET lock:report') === 'string' && (db.run('TTL lock:report') as number) > 0 && (db.run('TTL lock:report') as number) <= 10 && db.run('SET lock:report other NX EX 10') === null },
  leaderboard: { text: 'Собери рейтинг: sorted set `lb` с игроками ann (100), bob (250), cat (175). Первым по убыванию должен быть bob (ZRANGE lb 0 0 REV не поддерживается: используй ZRANGE lb -1 -1).', check: (db) => JSON.stringify(db.run('ZRANGE lb -1 -1')) === '["bob"]' && db.run('ZCARD lb') === 3 },
};

export function RedisTerminal({ mission, taskId }: { mission?: string; taskId?: string }) {
  const db = useRef(new MiniRedis());
  const [lines, setLines] = useState<{ cmd: string; out: string }[]>([{ cmd: 'PING', out: 'PONG' }]);
  const [input, setInput] = useState('');
  const [done, setDone] = useState(false);
  const [, force] = useState(0);
  const m = mission ? missions[mission] : undefined;

  const exec = (line: string) => {
    if (!line.trim()) return;
    const out = formatReply(db.current.run(line));
    setLines((l) => [...l, { cmd: line, out }]);
    if (m && !done && m.check(db.current)) {
      setDone(true);
      if (taskId) toggle('tasks', taskId, true);
    }
    force((n) => n + 1);
  };

  return (
    <div class="redisterm">
      {m && <p class="callout info"><b>Задание:</b> {m.text} {done && <b>✓ Выполнено!</b>}</p>}
      <div class="term" role="log" aria-live="polite" aria-label="Вывод терминала">
        {lines.slice(-30).map((l, i) => (
          <div key={i}><span class="prompt">127.0.0.1:6379&gt;</span> {l.cmd}<pre>{l.out}</pre></div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); exec(input); setInput(''); }} class="row">
        <label class="sr-only" for="redis-input">Команда Redis</label>
        <input id="redis-input" value={input} onInput={(e) => setInput((e.target as HTMLInputElement).value)} placeholder="SET key value EX 10" autocomplete="off" spellcheck={false} style={{ flex: 1, minWidth: 0 }} />
        <button class="primary" type="submit">Выполнить</button>
      </form>
      <div class="row wrap">
        <span class="muted">Время (виртуальное): {db.current.now / 1000} с. Ключей: {db.current.size()}.</span>
        <button onClick={() => { db.current.advance(1000); force((n) => n + 1); }}>+1 с</button>
        <button onClick={() => { db.current.advance(10000); force((n) => n + 1); }}>+10 с</button>
      </div>
      <p class="muted small">Подмножество команд: SET (EX, PX, NX, XX), GET, DEL, EXISTS, EXPIRE, TTL, PTTL, INCR, DECR, INCRBY, LPUSH, RPUSH, LPOP, RPOP, LRANGE, HSET, HGET, HGETALL, SADD, SMEMBERS, ZADD, ZRANGE, ZRANK, ZINCRBY и другие. Это модель на виртуальных часах, а не настоящий Redis; ответы на 69 команд сверены автотестом с настоящим redis-server 7.0.</p>
    </div>
  );
}

/* ---------- Rate limiter ---------- */
export function RateLimitSim() {
  const [algo, setAlgo] = useState<Algo>('fixed');
  const [pattern, setPattern] = useState('boundary');
  const limits = { limit: 10, windowMs: 1000 };
  const times = useMemo(() => patterns[pattern].times(limits.limit, limits.windowMs), [pattern]);
  const d = useMemo(() => decide(algo, limits, times), [algo, times]);
  const ok = d.filter(Boolean).length;
  const span = Math.max(...times) - Math.min(...times);
  return (
    <div class="ratesim">
      <div class="row wrap">
        <label>Алгоритм{' '}
          <select value={algo} onChange={(e) => setAlgo((e.target as HTMLSelectElement).value as Algo)}>
            {(Object.keys(algoLabel) as Algo[]).map((a) => <option key={a} value={a}>{algoLabel[a]}</option>)}
          </select>
        </label>
        <label>Поток запросов{' '}
          <select value={pattern} onChange={(e) => setPattern((e.target as HTMLSelectElement).value)}>
            {Object.entries(patterns).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <p>Лимит: <b>{limits.limit}</b> запросов за <b>{limits.windowMs / 1000} с</b>. Запросов в потоке: <b>{times.length}</b> (за {Math.round(span)} мс). Пропущено: <b>{ok}</b>, отклонено (429): <b>{times.length - ok}</b>.</p>
      <div class="rl-strip" role="img" aria-label={`Пропущено ${ok} из ${times.length} запросов`}>
        {times.map((t, i) => <span key={i} class={d[i] ? 'rl ok' : 'rl no'} title={`${Math.round(t)} мс: ${d[i] ? 'пропущен' : 'отклонён'}`} />)}
      </div>
      <p class="muted small">Зелёные — пропущенные, красные — отклонённые. Сравни фиксированное окно (на границе окон пропускает до 2×лимит) со скользящим и token bucket.</p>
    </div>
  );
}

/* ---------- Cache-aside ---------- */
export function CacheSim() {
  const [ttl, setTtl] = useState(5);
  const [rps, setRps] = useState(200);
  const [dbMs, setDbMs] = useState(300);
  const [prot, setProt] = useState<Protection>('none');
  const r = useMemo(() => simulateCache({ rps, seconds: 20, ttlMs: ttl * 1000, dbMs, protection: prot, seed: 4 }), [ttl, rps, dbMs, prot]);
  return (
    <div class="cachesim">
      <div class="row wrap">
        <label>TTL: <b>{ttl} с</b><input type="range" min={1} max={15} value={ttl} onInput={(e) => setTtl(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Запросов в секунду: <b>{rps}</b><input type="range" min={20} max={400} step={20} value={rps} onInput={(e) => setRps(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Время запроса к БД: <b>{dbMs} мс</b><input type="range" min={50} max={1000} step={50} value={dbMs} onInput={(e) => setDbMs(Number((e.target as HTMLInputElement).value))} /></label>
        <label>Защита{' '}
          <select value={prot} onChange={(e) => setProt((e.target as HTMLSelectElement).value as Protection)}>
            <option value="none">нет: каждый промах идёт в БД</option>
            <option value="single-flight">single-flight: один пересобирает, остальные ждут</option>
            <option value="stale">stale-while-revalidate: отдаём устаревшее</option>
          </select>
        </label>
      </div>
      <Chart kind="bar" title="Обращения к БД по секундам" xLabel="секунда" yLabel="запросов к БД" categories={r.dbPerSecond.map((_, i) => String(i))} series={[{ name: 'запросов к БД', points: r.dbPerSecond.map((v, i) => [i, v] as [number, number]) }]} height={200} />
      <p aria-live="polite">Hit ratio: <b>{(r.hitRatio * 100).toFixed(1)}%</b>. Обращений к БД: <b>{r.dbCalls}</b>, пик одновременных: <b>{r.peakDb}</b> из {r.requests} запросов.</p>
    </div>
  );
}
