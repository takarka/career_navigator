import { describe, expect, it } from 'vitest';
import { formatReply, MiniRedis } from './miniredis.ts';

const r = () => new MiniRedis();
const run = (db: MiniRedis, line: string) => db.run(line);

describe('мини-Redis: строки и TTL', () => {
  it('SET/GET/DEL/EXISTS', () => {
    const db = r();
    expect(run(db, 'SET k v')).toEqual({ ok: 'OK' });
    expect(run(db, 'GET k')).toBe('v');
    expect(run(db, 'EXISTS k')).toBe(1);
    expect(run(db, 'DEL k nope')).toBe(1);
    expect(run(db, 'GET k')).toBeNull();
  });

  it('SET NX не перезаписывает, XX требует существования', () => {
    const db = r();
    expect(run(db, 'SET k 1 NX')).toEqual({ ok: 'OK' });
    expect(run(db, 'SET k 2 NX')).toBeNull();
    expect(run(db, 'GET k')).toBe('1');
    expect(run(db, 'SET other 1 XX')).toBeNull();
  });

  it('EX/PX и TTL на виртуальных часах', () => {
    const db = r();
    run(db, 'SET k v EX 10');
    expect(run(db, 'TTL k')).toBe(10);
    db.advance(4000);
    expect(run(db, 'TTL k')).toBe(6);
    expect(run(db, 'PTTL k')).toBe(6000);
    db.advance(6000);
    expect(run(db, 'GET k')).toBeNull();
    expect(run(db, 'TTL k')).toBe(-2); // ключа нет
    run(db, 'SET p v');
    expect(run(db, 'TTL p')).toBe(-1); // ключ без TTL
  });

  it('повторный SET без KEEPTTL сбрасывает TTL', () => {
    const db = r();
    run(db, 'SET k v EX 10');
    run(db, 'SET k w');
    expect(run(db, 'TTL k')).toBe(-1);
  });

  it('INCR создаёт ключ и работает как счётчик; нечисловое значение — ошибка', () => {
    const db = r();
    expect(run(db, 'INCR n')).toBe(1);
    expect(run(db, 'INCRBY n 9')).toBe(10);
    expect(run(db, 'DECR n')).toBe(9);
    run(db, 'SET s abc');
    expect(run(db, 'INCR s')).toEqual({ error: 'ERR value is not an integer or out of range' });
  });

  it('INCR сохраняет TTL (основа rate limiter: INCR + EXPIRE)', () => {
    const db = r();
    run(db, 'INCR hits');
    run(db, 'EXPIRE hits 60');
    run(db, 'INCR hits');
    expect(run(db, 'TTL hits')).toBe(60);
    expect(run(db, 'GET hits')).toBe('2');
  });

  it('операция не того типа даёт WRONGTYPE', () => {
    const db = r();
    run(db, 'SET s 1');
    expect(run(db, 'LPUSH s x')).toEqual({ error: 'WRONGTYPE Operation against a key holding the wrong kind of value' });
  });
});

describe('мини-Redis: структуры', () => {
  it('списки: LPUSH добавляет в начало, RPUSH в конец, LRANGE с отрицательными индексами', () => {
    const db = r();
    run(db, 'RPUSH l a b c');
    run(db, 'LPUSH l z');
    expect(run(db, 'LRANGE l 0 -1')).toEqual(['z', 'a', 'b', 'c']);
    expect(run(db, 'LPOP l')).toBe('z');
    expect(run(db, 'RPOP l')).toBe('c');
    expect(run(db, 'LLEN l')).toBe(2);
  });

  it('хеши', () => {
    const db = r();
    expect(run(db, 'HSET user:1 name Ann age 30')).toBe(2);
    expect(run(db, 'HSET user:1 age 31')).toBe(0); // поле уже было
    expect(run(db, 'HGET user:1 age')).toBe('31');
    expect(run(db, 'HGETALL user:1')).toEqual(['name', 'Ann', 'age', '31']);
    expect(run(db, 'HDEL user:1 name')).toBe(1);
  });

  it('множества', () => {
    const db = r();
    expect(run(db, 'SADD s a b a')).toBe(2);
    expect(run(db, 'SISMEMBER s a')).toBe(1);
    expect(run(db, 'SMEMBERS s')).toEqual(['a', 'b']);
    expect(run(db, 'SREM s a')).toBe(1);
    expect(run(db, 'SCARD s')).toBe(1);
  });

  it('упорядоченные множества: ZADD, ZRANGE WITHSCORES, ZRANK, ZINCRBY', () => {
    const db = r();
    run(db, 'ZADD lb 100 ann 250 bob 175 cat');
    expect(run(db, 'ZRANGE lb 0 -1')).toEqual(['ann', 'cat', 'bob']);
    expect(run(db, 'ZRANGE lb 0 1 WITHSCORES')).toEqual(['ann', '100', 'cat', '175']);
    expect(run(db, 'ZRANK lb bob')).toBe(2);
    run(db, 'ZINCRBY lb 200 ann');
    expect(run(db, 'ZRANGE lb -1 -1')).toEqual(['ann']);
    expect(run(db, 'ZSCORE lb ann')).toBe('300');
  });

  it('пустая коллекция исчезает вместе с ключом', () => {
    const db = r();
    run(db, 'RPUSH l a');
    run(db, 'LPOP l');
    expect(run(db, 'EXISTS l')).toBe(0);
  });

  it('форматирование ответов в стиле redis-cli', () => {
    const db = r();
    expect(formatReply(run(db, 'SET k v'))).toBe('OK');
    expect(formatReply(run(db, 'GET k'))).toBe('"v"');
    expect(formatReply(run(db, 'GET none'))).toBe('(nil)');
    expect(formatReply(run(db, 'INCR n'))).toBe('(integer) 1');
    expect(formatReply(['a', 'b'])).toBe('1) "a"\n2) "b"');
    expect(formatReply(run(db, 'WHAT'))).toContain('(error)');
  });
});
