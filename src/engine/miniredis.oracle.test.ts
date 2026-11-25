import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MiniRedis, type Reply } from './miniredis.ts';

/** Оракул: те же команды выполняются на настоящем redis-server и на модели; ответы должны совпасть. Пропускается без redis-server. */
const hasRedis = spawnSync('redis-server', ['--version']).status === 0;
const require_ = createRequire(import.meta.url);
type Client = { cmd: (...a: string[]) => Promise<unknown>; close: () => void };

const norm = (r: unknown): unknown => {
  if (r instanceof Error) return `ERR:${r.message.split(' ')[0]}`;
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const o = r as { ok?: string; error?: string };
    if (o.error !== undefined) return `ERR:${o.error.split(' ')[0]}`;
    if (o.ok !== undefined) return o.ok;
  }
  if (Array.isArray(r)) return r.map(norm);
  return r;
};

// Команды без зависимости от времени; результаты сортируемых по порядку структур (set) сравниваются как отсортированные.
const script = [
  'SET a 1', 'GET a', 'GET missing', 'SET a 2 NX', 'SET b 3 NX', 'GET b', 'SET c 4 XX', 'EXISTS a b c', 'DEL a b c', 'EXISTS a',
  'INCR n', 'INCR n', 'INCRBY n 10', 'DECR n', 'DECRBY n 5', 'GET n', 'SET s abc', 'INCR s', 'TYPE n', 'TYPE nokey',
  'RPUSH l x y z', 'LPUSH l w', 'LRANGE l 0 -1', 'LRANGE l 1 2', 'LLEN l', 'LPOP l', 'RPOP l', 'LRANGE l 0 -1', 'GET l', 'LPOP empty',
  'HSET h f1 v1', 'HSET h f1 v2 f2 v3', 'HGET h f1', 'HGET h nope', 'HDEL h f1 nope', 'HGETALL h',
  'SADD st a b a c', 'SCARD st', 'SISMEMBER st a', 'SISMEMBER st z', 'SREM st a z', 'SMEMBERS st',
  'ZADD z 1 a 2 b 3 c', 'ZADD z 5 a', 'ZSCORE z a', 'ZSCORE z nope', 'ZRANK z b', 'ZRANK z nope', 'ZINCRBY z 10 b', 'ZRANGE z 0 -1', 'ZRANGE z 0 -1 WITHSCORES', 'ZCARD z', 'ZREM z a nope', 'ZCARD z',
  'SET e v PX 100000', 'PTTL nokey', 'SET plain v', 'PTTL plain', 'PERSIST plain', 'PERSIST e', 'PTTL e', 'EXPIRE plain 100', 'PERSIST plain', 'TTL plain',
  'LPUSH n 1', 'HGET n f', 'SADD n 1', 'ZADD n 1 a', 'PING',
];

describe.skipIf(!hasRedis)('оракул: мини-Redis против настоящего redis-server', () => {
  let proc: ChildProcess;
  let client: Client;
  beforeAll(async () => {
    const port = await new Promise<number>((res) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });
    proc = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
    const { connect } = require_('../../labs/m04/lock/resp.cjs') as { connect: (p: number) => Promise<Client> };
    for (let i = 0; i < 50; i++) { try { client = await connect(port); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    throw new Error('redis-server не ответил');
  }, 20000);
  afterAll(() => { client?.close(); proc?.kill(); });

  it(`${script.length} команд дают те же ответы`, async () => {
    const mini = new MiniRedis();
    const diffs: string[] = [];
    for (const line of script) {
      const args = line.split(' ');
      let real: unknown;
      try { real = await client.cmd(...args); } catch (e) { real = e; }
      const model = mini.run(line) as Reply | { error: string };
      let a = norm(real), b = norm(model);
      if (/^(SMEMBERS)/.test(line) && Array.isArray(a) && Array.isArray(b)) { a = [...a].sort(); b = [...b].sort(); }
      if (process.env.ORACLE_DEBUG) console.log(line, '=>', JSON.stringify(a), JSON.stringify(b));
      if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${line}\n   Redis: ${JSON.stringify(a)}\n   модель: ${JSON.stringify(b)}`);
    }
    expect(diffs, diffs.join('\n')).toEqual([]);
  }, 30000);
});
