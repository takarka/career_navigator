import { describe, expect, it } from 'vitest';
import { MiniRedis } from '../engine/miniredis.ts';
import { missions } from './RedisWidgets.tsx';

const solutions: Record<string, string[]> = {
  counter: ['INCR visits', 'INCR visits', 'INCR visits'],
  session: ['SET session:42 abc EX 30'],
  lock: ['SET lock:report token-1 NX EX 10'],
  leaderboard: ['ZADD lb 100 ann 250 bob 175 cat'],
};

describe('задания терминала Redis', () => {
  for (const [id, cmds] of Object.entries(solutions)) {
    it(`${id}: решение выполняет задание, пустая база нет`, () => {
      const fresh = new MiniRedis();
      expect(missions[id].check(fresh)).toBe(false);
      const db = new MiniRedis();
      for (const c of cmds) db.run(c);
      expect(missions[id].check(db)).toBe(true);
    });
  }
  it('все задания имеют решение', () => expect(Object.keys(missions).sort()).toEqual(Object.keys(solutions).sort()));
});
