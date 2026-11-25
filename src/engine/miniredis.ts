/**
 * Мини-Redis: чистая реализация подмножества команд с виртуальными часами (мс).
 * Типы значений: string, list, hash, set, zset. Поддерживается TTL (EX/PX/EXPIRE/PEXPIRE/TTL/PTTL/PERSIST).
 * Ответы форматируются как в redis-cli. Это учебная модель: нет персистентности, кластера, транзакций и Lua.
 * Семантика команд взята из документации Redis; на реальном Redis сверка выполняется лабораторией labs/m04 (в CI).
 */
export type Reply = string | number | null | { ok: string } | Reply[];

type Value =
  | { t: 'string'; v: string }
  | { t: 'list'; v: string[] }
  | { t: 'hash'; v: Map<string, string> }
  | { t: 'set'; v: Set<string> }
  | { t: 'zset'; v: Map<string, number> };

export class RedisError extends Error {}
const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

export class MiniRedis {
  now = 0;
  private data = new Map<string, Value>();
  private expires = new Map<string, number>();

  advance(ms: number) {
    this.now += ms;
  }

  private alive(key: string): boolean {
    const at = this.expires.get(key);
    if (at !== undefined && at <= this.now) {
      this.data.delete(key);
      this.expires.delete(key);
      return false;
    }
    return this.data.has(key);
  }

  private get<T extends Value['t']>(key: string, t: T): Extract<Value, { t: T }> | undefined {
    if (!this.alive(key)) return undefined;
    const v = this.data.get(key)!;
    if (v.t !== t) throw new RedisError(WRONGTYPE);
    return v as Extract<Value, { t: T }>;
  }

  private put(key: string, v: Value, keepTtl = false) {
    this.data.set(key, v);
    if (!keepTtl) this.expires.delete(key);
  }

  /** Выполнить команду из строки: `SET key value EX 10`. Ошибки возвращаются строкой «(error) …». */
  run(line: string): Reply | { error: string } {
    const args = tokenize(line);
    if (!args.length) return { error: 'ERR empty command' };
    try {
      return this.exec(args[0].toUpperCase(), args.slice(1));
    } catch (e) {
      if (e instanceof RedisError) return { error: e.message };
      throw e;
    }
  }

  private int(s: string): number {
    if (!/^-?\d+$/.test(s)) throw new RedisError('ERR value is not an integer or out of range');
    return Number(s);
  }

  private need(cmd: string, args: string[], min: number, max = min) {
    if (args.length < min || args.length > max) throw new RedisError(`ERR wrong number of arguments for '${cmd.toLowerCase()}' command`);
  }

  private exec(cmd: string, a: string[]): Reply {
    switch (cmd) {
      case 'PING':
        return { ok: 'PONG' };
      case 'SET': {
        this.need(cmd, a, 2, 7);
        const [key, value, ...opts] = a;
        let ttl: number | undefined;
        let nx = false;
        let xx = false;
        let keep = false;
        for (let i = 0; i < opts.length; i++) {
          const o = opts[i].toUpperCase();
          if (o === 'EX') ttl = this.int(opts[++i] ?? '') * 1000;
          else if (o === 'PX') ttl = this.int(opts[++i] ?? '');
          else if (o === 'NX') nx = true;
          else if (o === 'XX') xx = true;
          else if (o === 'KEEPTTL') keep = true;
          else throw new RedisError('ERR syntax error');
        }
        if ((ttl !== undefined && ttl <= 0) || (nx && xx)) throw new RedisError('ERR invalid expire time in set');
        const exists = this.alive(key);
        if ((nx && exists) || (xx && !exists)) return null;
        this.put(key, { t: 'string', v: value }, keep);
        if (ttl !== undefined) this.expires.set(key, this.now + ttl);
        return { ok: 'OK' };
      }
      case 'GET': {
        this.need(cmd, a, 1);
        return this.get(a[0], 'string')?.v ?? null;
      }
      case 'DEL': {
        let n = 0;
        for (const k of a) if (this.alive(k)) {
          this.data.delete(k);
          this.expires.delete(k);
          n++;
        }
        return n;
      }
      case 'EXISTS': return a.filter((k) => this.alive(k)).length;
      case 'TYPE': return { ok: this.alive(a[0]) ? this.data.get(a[0])!.t : 'none' };
      case 'KEYS': {
        // только простейший шаблон: * или префикс*
        const pat = a[0] ?? '*';
        const prefix = pat.endsWith('*') ? pat.slice(0, -1) : null;
        return [...this.data.keys()].filter((k) => this.alive(k) && (prefix === null ? k === pat : k.startsWith(prefix))).sort();
      }
      case 'EXPIRE':
      case 'PEXPIRE': {
        this.need(cmd, a, 2);
        if (!this.alive(a[0])) return 0;
        const ms = this.int(a[1]) * (cmd === 'EXPIRE' ? 1000 : 1);
        if (ms <= 0) {
          this.data.delete(a[0]);
          this.expires.delete(a[0]);
          return 1;
        }
        this.expires.set(a[0], this.now + ms);
        return 1;
      }
      case 'TTL':
      case 'PTTL': {
        this.need(cmd, a, 1);
        if (!this.alive(a[0])) return -2;
        const at = this.expires.get(a[0]);
        if (at === undefined) return -1;
        const left = at - this.now;
        return cmd === 'TTL' ? Math.floor((left + 500) / 1000) : left; // как в Redis: округление до ближайшей секунды
      }
      case 'PERSIST': return this.alive(a[0]) && this.expires.delete(a[0]) ? 1 : 0;
      case 'INCR':
      case 'DECR':
      case 'INCRBY':
      case 'DECRBY': {
        const by = cmd === 'INCR' ? 1 : cmd === 'DECR' ? -1 : this.int(a[1] ?? '') * (cmd === 'DECRBY' ? -1 : 1);
        const cur = this.get(a[0], 'string');
        const next = (cur ? this.int(cur.v) : 0) + by;
        this.put(a[0], { t: 'string', v: String(next) }, true);
        return next;
      }
      case 'LPUSH':
      case 'RPUSH': {
        this.need(cmd, a, 2, Infinity);
        const l = this.get(a[0], 'list') ?? { t: 'list' as const, v: [] as string[] };
        for (const x of a.slice(1)) cmd === 'LPUSH' ? l.v.unshift(x) : l.v.push(x);
        this.put(a[0], l, true);
        return l.v.length;
      }
      case 'LPOP':
      case 'RPOP': {
        const l = this.get(a[0], 'list');
        if (!l || !l.v.length) return null;
        const x = cmd === 'LPOP' ? l.v.shift()! : l.v.pop()!;
        if (!l.v.length) this.data.delete(a[0]);
        return x;
      }
      case 'LLEN': return this.get(a[0], 'list')?.v.length ?? 0;
      case 'LRANGE': {
        const l = this.get(a[0], 'list')?.v ?? [];
        const norm = (i: number) => (i < 0 ? Math.max(0, l.length + i) : i);
        return l.slice(norm(this.int(a[1])), norm(this.int(a[2])) + 1);
      }
      case 'HSET': {
        this.need(cmd, a, 3, Infinity);
        const h = this.get(a[0], 'hash') ?? { t: 'hash' as const, v: new Map<string, string>() };
        let added = 0;
        for (let i = 1; i + 1 < a.length; i += 2) {
          if (!h.v.has(a[i])) added++;
          h.v.set(a[i], a[i + 1]);
        }
        this.put(a[0], h, true);
        return added;
      }
      case 'HGET': return this.get(a[0], 'hash')?.v.get(a[1]) ?? null;
      case 'HGETALL': return [...(this.get(a[0], 'hash')?.v ?? new Map()).entries()].flat();
      case 'HDEL': {
        const h = this.get(a[0], 'hash');
        let n = 0;
        for (const f of a.slice(1)) if (h?.v.delete(f)) n++;
        if (h && !h.v.size) this.data.delete(a[0]);
        return n;
      }
      case 'SADD': {
        const s = this.get(a[0], 'set') ?? { t: 'set' as const, v: new Set<string>() };
        let n = 0;
        for (const m of a.slice(1)) if (!s.v.has(m)) {
          s.v.add(m);
          n++;
        }
        this.put(a[0], s, true);
        return n;
      }
      case 'SREM': {
        const s = this.get(a[0], 'set');
        let n = 0;
        for (const m of a.slice(1)) if (s?.v.delete(m)) n++;
        if (s && !s.v.size) this.data.delete(a[0]);
        return n;
      }
      case 'SISMEMBER': return this.get(a[0], 'set')?.v.has(a[1]) ? 1 : 0;
      case 'SMEMBERS': return [...(this.get(a[0], 'set')?.v ?? [])].sort();
      case 'SCARD': return this.get(a[0], 'set')?.v.size ?? 0;
      case 'ZADD': {
        this.need(cmd, a, 3, Infinity);
        const z = this.get(a[0], 'zset') ?? { t: 'zset' as const, v: new Map<string, number>() };
        let added = 0;
        for (let i = 1; i + 1 < a.length; i += 2) {
          const score = Number(a[i]);
          if (Number.isNaN(score)) throw new RedisError('ERR value is not a valid float');
          if (!z.v.has(a[i + 1])) added++;
          z.v.set(a[i + 1], score);
        }
        this.put(a[0], z, true);
        return added;
      }
      case 'ZINCRBY': {
        const z = this.get(a[0], 'zset') ?? { t: 'zset' as const, v: new Map<string, number>() };
        const next = (z.v.get(a[2]) ?? 0) + Number(a[1]);
        z.v.set(a[2], next);
        this.put(a[0], z, true);
        return String(next);
      }
      case 'ZSCORE': {
        const s = this.get(a[0], 'zset')?.v.get(a[1]);
        return s === undefined ? null : String(s);
      }
      case 'ZRANK': {
        const z = this.zsorted(a[0]);
        const i = z.findIndex(([m]) => m === a[1]);
        return i < 0 ? null : i;
      }
      case 'ZREM': {
        const z = this.get(a[0], 'zset');
        let n = 0;
        for (const m of a.slice(1)) if (z?.v.delete(m)) n++;
        if (z && !z.v.size) this.data.delete(a[0]);
        return n;
      }
      case 'ZCARD': return this.get(a[0], 'zset')?.v.size ?? 0;
      case 'ZRANGE': {
        const withScores = a.slice(3).some((x) => x.toUpperCase() === 'WITHSCORES');
        const z = this.zsorted(a[0]);
        const norm = (i: number) => (i < 0 ? Math.max(0, z.length + i) : i);
        const part = z.slice(norm(this.int(a[1])), norm(this.int(a[2])) + 1);
        return withScores ? part.flatMap(([m, s]) => [m, String(s)]) : part.map(([m]) => m);
      }
      default:
        throw new RedisError(`ERR unknown command '${cmd.toLowerCase()}'`);
    }
  }

  private zsorted(key: string): [string, number][] {
    return [...(this.get(key, 'zset')?.v ?? new Map<string, number>()).entries()].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
  }

  size(): number {
    return [...this.data.keys()].filter((k) => this.alive(k)).length;
  }
}

/** Разбор строки команды с кавычками. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  for (let m = re.exec(line); m; m = re.exec(line)) out.push((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1'));
  return out;
}

/** Форматирование ответа в стиле redis-cli. */
export function formatReply(r: Reply | { error: string }, indent = ''): string {
  if (r === null) return '(nil)';
  if (typeof r === 'object' && !Array.isArray(r)) return 'error' in r ? `(error) ${r.error}` : r.ok;
  if (typeof r === 'number') return `(integer) ${r}`;
  if (typeof r === 'string') return `"${r}"`;
  if (!r.length) return '(empty array)';
  return r.map((x, i) => `${indent}${i + 1}) ${formatReply(x, indent + '   ')}`).join('\n');
}
