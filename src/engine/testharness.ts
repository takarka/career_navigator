/**
 * Мини-раннер тестов для упражнений «напиши функцию».
 * Исходник harnessSource самодостаточен: он исполняется и в Web Worker, и в vitest (через new Function),
 * поэтому поведение раннера проверяется автотестом.
 *
 * Внутри теста доступны: expect, advance(ms) (управляемые часы), setTimeout/clearTimeout (подменены),
 * now() (виртуальное время, мс) и все функции из кода пользователя (export убирается).
 */
export const harnessSource = String.raw`
function makeClock() {
  let t = 0, seq = 0;
  const timers = [];
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  return {
    now: () => t,
    setTimeout(fn, ms, ...args) {
      const id = ++seq;
      timers.push({ id, at: t + Math.max(0, Number(ms) || 0), seq: id, fn: () => fn(...args) });
      return id;
    },
    clearTimeout(id) {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    async advance(ms) {
      const target = t + ms;
      await flush();
      for (;;) {
        timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const next = timers[0];
        if (!next || next.at > target) break;
        timers.shift();
        t = next.at;
        next.fn();
        await flush();
      }
      t = target;
      await flush();
    },
  };
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

const show = (v) => { try { return typeof v === 'string' ? JSON.stringify(v) : (typeof v === 'function' ? 'function' : JSON.stringify(v)); } catch { return String(v); } };

function makeMatchers(actual, negate) {
  const check = (pass, msg, negMsg) => {
    if (negate ? pass : !pass) throw new Error(negate ? negMsg : msg);
  };
  return {
    toBe: (e) => check(Object.is(actual, e), 'Ожидалось ' + show(e) + ', получено ' + show(actual), 'Не ожидалось ' + show(e)),
    toEqual: (e) => check(deepEqual(actual, e), 'Ожидалось ' + show(e) + ', получено ' + show(actual), 'Значения не должны быть равны: ' + show(e)),
    toBeTruthy: () => check(!!actual, 'Ожидалось истинное значение, получено ' + show(actual), 'Ожидалось ложное значение'),
    toBeFalsy: () => check(!actual, 'Ожидалось ложное значение, получено ' + show(actual), 'Ожидалось истинное значение'),
    toBeGreaterThan: (n) => check(actual > n, 'Ожидалось больше ' + n + ', получено ' + show(actual), 'Ожидалось не больше ' + n),
    toBeLessThan: (n) => check(actual < n, 'Ожидалось меньше ' + n + ', получено ' + show(actual), 'Ожидалось не меньше ' + n),
    toContain: (x) => check(actual != null && actual.includes(x), 'Ожидалось, что ' + show(actual) + ' содержит ' + show(x), 'Не ожидалось, что значение содержит ' + show(x)),
    toThrow: (sub) => {
      let thrown = null;
      try { actual(); } catch (e) { thrown = e; }
      const ok = thrown !== null && (sub === undefined || String(thrown && thrown.message || thrown).includes(sub));
      check(ok, thrown === null ? 'Ожидалось исключение, но его не было' : 'Сообщение исключения не содержит ' + show(sub) + ': ' + show(String(thrown.message || thrown)), 'Не ожидалось исключение');
    },
  };
}

function makeExpect() {
  const expect = (actual) => {
    const api = makeMatchers(actual, false);
    api.not = makeMatchers(actual, true);
    api.rejects = {
      toThrow: async (sub) => {
        let thrown = null, resolved = false;
        try { await actual; resolved = true; } catch (e) { thrown = e; }
        if (resolved) throw new Error('Ожидался reject, но промис выполнился');
        if (sub !== undefined && !String(thrown && thrown.message || thrown).includes(sub)) throw new Error('Сообщение ошибки не содержит ' + show(sub) + ': ' + show(String(thrown && thrown.message || thrown)));
      },
    };
    api.resolves = new Proxy({}, {
      get: (_, name) => async (...a) => {
        const v = await actual;
        return makeMatchers(v, false)[name](...a);
      },
    });
    return api;
  };
  return expect;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runSuite(userCode, tests, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 2000;
  const code = String(userCode).replace(/^\s*export\s+(default\s+)?/gm, '');
  const results = [];
  for (const test of tests) {
    const clock = makeClock();
    const expect = makeExpect();
    let timer;
    try {
      const fn = new AsyncFunction('expect', 'advance', 'now', 'setTimeout', 'clearTimeout', code + '\n;' + test.code);
      const run = fn(expect, clock.advance, clock.now, clock.setTimeout, clock.clearTimeout);
      const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Тест не завершился за ' + timeoutMs + ' мс')), timeoutMs); });
      await Promise.race([run, limit]);
      results.push({ name: test.name, ok: true, message: '' });
    } catch (e) {
      results.push({ name: test.name, ok: false, message: String((e && e.message) || e) });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}
`;

export interface TestCase {
  name: string;
  code: string;
}

export interface TestResult {
  name: string;
  ok: boolean;
  message: string;
}

/** Запуск набора тестов в текущем контексте (используется автотестами раннера). */
export function runSuiteLocal(userCode: string, tests: TestCase[], timeoutMs = 2000): Promise<TestResult[]> {
  const factory = new Function(`${harnessSource}; return runSuite;`) as () => (u: string, t: TestCase[], o: { timeoutMs: number }) => Promise<TestResult[]>;
  return factory()(userCode, tests, { timeoutMs });
}

const workerSource = `${harnessSource}
self.onmessage = async (e) => {
  try {
    const res = await runSuite(e.data.code, e.data.tests, { timeoutMs: e.data.timeoutMs });
    self.postMessage({ results: res });
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
};`;

export interface SuiteOutcome {
  results: TestResult[];
  error: string | null;
  timedOut: boolean;
}

/** Запуск набора тестов в Web Worker; зависший код прерывается общим таймаутом. */
export function runTests(code: string, tests: TestCase[], timeoutMs = 2000): Promise<SuiteOutcome> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const done = (r: SuiteOutcome) => {
      clearTimeout(guard);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const guard = setTimeout(() => done({ results: [], error: 'Превышено время выполнения (возможен бесконечный цикл)', timedOut: true }), timeoutMs * tests.length + 1500);
    worker.onmessage = (e) => done({ results: e.data.results ?? [], error: e.data.error ?? null, timedOut: false });
    worker.onerror = (e) => done({ results: [], error: e.message, timedOut: false });
    worker.postMessage({ code, tests, timeoutMs });
  });
}
