import type { DiagramSpec } from '../engine/diagram.ts';
import type { TimelineSpec } from '../engine/timeline.ts';
import type { TestExercise } from './types.ts';

export const demoTimeline: TimelineSpec = {
  lanes: [
    { id: 's1', title: 'Сессия 1' },
    { id: 's2', title: 'Сессия 2' },
  ],
  events: [
    { id: 'a1', lane: 's1', at: 0, label: 'BEGIN', step: 0 },
    { id: 'a2', lane: 's1', at: 1, label: 'UPDATE acc 1', kind: 'ok', step: 1 },
    { id: 'b1', lane: 's2', at: 2, label: 'UPDATE acc 1', kind: 'wait', step: 2 },
    { id: 'a3', lane: 's1', at: 3, label: 'COMMIT', kind: 'ok', step: 3 },
    { id: 'b2', lane: 's2', at: 4, label: 'UPDATE выполнен', kind: 'ok', step: 4 },
  ],
  arrows: [{ from: 'a2', to: 'b1', label: 'строка заблокирована' }, { from: 'a3', to: 'b2', label: 'блокировка снята' }],
  steps: [
    { title: 'Начало', text: 'Первая сессия открывает транзакцию.' },
    { title: 'Блокировка строки', text: 'UPDATE берёт блокировку на строку acc 1.' },
    { title: 'Ожидание', text: 'Вторая сессия пытается обновить ту же строку и ждёт.' },
    { title: 'COMMIT', text: 'Первая сессия фиксирует изменения, блокировка снимается.' },
    { title: 'Продолжение', text: 'Вторая сессия получает блокировку и завершает UPDATE.' },
  ],
};

export const demoDiagram: DiagramSpec = {
  nodes: [
    { id: 'web', kind: 'client', label: 'Web', x: 20, y: 10 },
    { id: 'api', kind: 'service', label: 'API', x: 200, y: 10, protected: false },
    { id: 'pay', kind: 'service', label: 'Payments', x: 380, y: 10 },
    { id: 'db', kind: 'db', label: 'PostgreSQL', x: 560, y: 10 },
    { id: 'q', kind: 'queue', label: 'Queue', x: 200, y: 110 },
    { id: 'mail', kind: 'service', label: 'Mailer', x: 380, y: 110 },
  ],
  edges: [
    { from: 'web', to: 'api', sync: true },
    { from: 'api', to: 'pay', sync: true },
    { from: 'pay', to: 'db', sync: true },
    { from: 'api', to: 'q', sync: false, label: 'событие' },
    { from: 'mail', to: 'q', sync: true },
  ],
};

export const demoTestExercise: TestExercise = {
  starter: `export async function retry(fn, { retries, delay }) {\n  // повтори fn до retries раз с паузой delay мс между попытками\n}\n`,
  tests: [
    { name: 'возвращает результат с первой попытки', code: `expect(await retry(async () => 42, { retries: 2, delay: 10 })).toBe(42);` },
    {
      name: 'повторяет с паузой',
      code: `let calls = 0;\nconst p = retry(async () => { calls++; if (calls < 3) throw new Error('fail'); return 'ok'; }, { retries: 3, delay: 100 });\nawait advance(0);\nexpect(calls).toBe(1);\nawait advance(100);\nexpect(calls).toBe(2);\nawait advance(100);\nexpect(await p).toBe('ok');`,
    },
    { name: 'бросает последнюю ошибку', code: `const p = retry(async () => { throw new Error('boom'); }, { retries: 1, delay: 5 });\nconst a = expect(p).rejects.toThrow('boom');\nawait advance(10);\nawait a;` },
  ],
  solution: `export async function retry(fn, { retries, delay }) {\n  for (let attempt = 0; ; attempt++) {\n    try {\n      return await fn(attempt);\n    } catch (e) {\n      if (attempt >= retries) throw e;\n      await new Promise((r) => setTimeout(r, delay));\n    }\n  }\n}\n`,
};
