import { describe, expect, it } from 'vitest';
import { runSuiteLocal } from './testharness.ts';

const retry = `
export async function retry(fn, { retries, delay }) {
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); }
    catch (e) {
      if (attempt >= retries) throw e;
      attempt++;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}`;

const tests = [
  { name: 'возвращает результат с первой попытки', code: `expect(await retry(async () => 42, { retries: 2, delay: 10 })).toBe(42);` },
  {
    name: 'повторяет с задержкой на виртуальных часах',
    code: `
      let calls = 0;
      const p = retry(async () => { calls++; if (calls < 3) throw new Error('fail'); return 'ok'; }, { retries: 3, delay: 100 });
      await advance(0);
      expect(calls).toBe(1);
      await advance(100);
      expect(calls).toBe(2);
      await advance(100);
      expect(await p).toBe('ok');
      expect(now()).toBe(200);`,
  },
  { name: 'после исчерпания попыток бросает ошибку', code: `
      const p = retry(async () => { throw new Error('boom'); }, { retries: 1, delay: 5 });
      const assertion = expect(p).rejects.toThrow('boom');
      await advance(10);
      await assertion;` },
];

describe('мини-раннер тестов', () => {
  it('верное решение проходит все тесты', async () => {
    const res = await runSuiteLocal(retry, tests);
    expect(res.map((r) => [r.name, r.ok, r.message])).toEqual(tests.map((t) => [t.name, true, '']));
  });

  it('неверное решение даёт читаемое сообщение', async () => {
    const res = await runSuiteLocal(`function retry() { return Promise.resolve(1); }`, tests);
    expect(res[0].ok).toBe(false);
    expect(res[0].message).toBe('Ожидалось 42, получено 1');
    expect(res[1].ok).toBe(false);
  });

  it('ошибка в коде пользователя не ломает остальные тесты', async () => {
    const res = await runSuiteLocal(`function retry( {`, tests);
    expect(res.every((r) => !r.ok)).toBe(true);
  });

  it('тест, который не завершается, падает по таймауту', async () => {
    const res = await runSuiteLocal(`function hang() { return new Promise(() => {}); }`, [{ name: 'висит', code: 'await hang();' }], 50);
    expect(res[0].ok).toBe(false);
    expect(res[0].message).toContain('не завершился');
  });

  it('matchers: toEqual, not, toThrow', async () => {
    const res = await runSuiteLocal('', [
      { name: 'a', code: `expect({ a: [1, { b: 2 }] }).toEqual({ a: [1, { b: 2 }] }); expect(1).not.toBe(2); expect(() => { throw new Error('x y'); }).toThrow('y');` },
      { name: 'b', code: `expect([1]).toEqual([2]);` },
    ]);
    expect(res[0].ok).toBe(true);
    expect(res[1].ok).toBe(false);
  });

  it('управляемые часы выполняют таймеры по порядку срока', async () => {
    const res = await runSuiteLocal('', [{ name: 'order', code: `
      const out = [];
      setTimeout(() => out.push('b'), 20);
      setTimeout(() => out.push('a'), 10);
      setTimeout(() => out.push('c'), 20);
      await advance(25);
      expect(out).toEqual(['a', 'b', 'c']);` }]);
    expect(res[0]).toEqual({ name: 'order', ok: true, message: '' });
  });
});
