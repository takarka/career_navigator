import type { Lesson } from '../types.ts';
import type { TestExercise } from '../types.ts';
import { demoDiagram } from '../demo.ts';

export const retryExercise: TestExercise = {
  starter: `export async function retry(fn, { retries, delay }) {
  // Вызови fn(attempt). При ошибке повтори до retries раз, делая паузу delay мс между попытками.
  // После последней неудачи пробрось последнюю ошибку.
}
`,
  tests: [
    { name: 'возвращает результат с первой попытки', code: `expect(await retry(async () => 42, { retries: 2, delay: 10 })).toBe(42);` },
    {
      name: 'повторяет с паузой между попытками',
      code: `let calls = 0;
const p = retry(async () => { calls++; if (calls < 3) throw new Error('fail'); return 'ok'; }, { retries: 3, delay: 100 });
await advance(0);
expect(calls).toBe(1);
await advance(100);
expect(calls).toBe(2);
await advance(100);
expect(await p).toBe('ok');`,
    },
    {
      name: 'после исчерпания попыток бросает последнюю ошибку',
      code: `let calls = 0;
const p = retry(async () => { calls++; throw new Error('boom' + calls); }, { retries: 2, delay: 5 });
const assertion = expect(p).rejects.toThrow('boom3');
await advance(20);
await assertion;
expect(calls).toBe(3);`,
    },
  ],
  solution: `export async function retry(fn, { retries, delay }) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
`,
};

export const pLimitExercise: TestExercise = {
  starter: `export function pLimit(concurrency) {
  // Верни функцию limit(fn): она запускает fn не раньше, чем освободится слот,
  // и возвращает промис с результатом fn. Одновременно работает не больше concurrency задач.
}
`,
  tests: [
    {
      name: 'одновременно работает не больше N задач',
      code: `const limit = pLimit(2);
let running = 0, max = 0;
const task = () => limit(async () => {
  running++; max = Math.max(max, running);
  await new Promise((r) => setTimeout(r, 100));
  running--;
  return 1;
});
const ps = [task(), task(), task(), task(), task()];
await advance(0);
expect(running).toBe(2);
await advance(100);
expect(running).toBe(2);
await advance(100);
await advance(100);
const res = await Promise.all(ps);
expect(max).toBe(2);
expect(res).toEqual([1, 1, 1, 1, 1]);`,
    },
    { name: 'возвращает результат задачи', code: `const limit = pLimit(1);\nexpect(await limit(async () => 5)).toBe(5);` },
    { name: 'пробрасывает ошибку и не блокирует очередь', code: `const limit = pLimit(1);\nconst bad = expect(limit(async () => { throw new Error('x'); })).rejects.toThrow('x');\nconst good = limit(async () => 'next');\nawait bad;\nexpect(await good).toBe('next');` },
  ],
  solution: `export function pLimit(concurrency) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}
`,
};

export const debounceExercise: TestExercise = {
  starter: `export function debounce(fn, wait) {
  // Верни функцию, которая вызывает fn только после паузы в wait мс без новых вызовов.
  // fn получает аргументы последнего вызова.
}
`,
  tests: [
    { name: 'вызывает один раз после паузы', code: `let n = 0;\nconst d = debounce(() => n++, 100);\nd(); d(); d();\nawait advance(99);\nexpect(n).toBe(0);\nawait advance(1);\nexpect(n).toBe(1);` },
    { name: 'передаёт аргументы последнего вызова', code: `let last;\nconst d = debounce((x) => { last = x; }, 50);\nd(1); d(2);\nawait advance(50);\nexpect(last).toBe(2);` },
    { name: 'каждый новый вызов сбрасывает таймер', code: `let n = 0;\nconst d = debounce(() => n++, 100);\nd();\nawait advance(60);\nd();\nawait advance(60);\nexpect(n).toBe(0);\nawait advance(40);\nexpect(n).toBe(1);` },
  ],
  solution: `export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
`,
};

export const memoizeExercise: TestExercise = {
  starter: `export function memoize(fn) {
  // Верни функцию, которая кэширует результаты fn по набору аргументов.
  // Повторный вызов с теми же аргументами не вызывает fn.
}
`,
  tests: [
    { name: 'один вызов для одинаковых аргументов', code: `let calls = 0;\nconst f = memoize((a, b) => { calls++; return a + b; });\nexpect(f(1, 2)).toBe(3);\nexpect(f(1, 2)).toBe(3);\nexpect(calls).toBe(1);` },
    { name: 'разные аргументы дают разные записи', code: `let calls = 0;\nconst f = memoize((a, b) => { calls++; return a - b; });\nexpect(f(1, 2)).toBe(-1);\nexpect(f(2, 1)).toBe(1);\nexpect(calls).toBe(2);` },
    { name: 'кэширует и результат undefined', code: `let calls = 0;\nconst g = memoize(() => { calls++; return undefined; });\ng(); g();\nexpect(calls).toBe(1);` },
    { name: 'ошибки не кэшируются', code: `let calls = 0;\nconst h = memoize(() => { calls++; throw new Error('x'); });\nexpect(() => h()).toThrow('x');\nexpect(() => h()).toThrow('x');\nexpect(calls).toBe(2);` },
  ],
  solution: `export function memoize(fn) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const value = fn(...args);
    cache.set(key, value);
    return value;
  };
}
`,
};

export const liveLesson: Lesson = {
  id: 'm14-l03',
  blocks: [
    {
      t: 'md',
      text: `## Главное за минуту

- На live coding оценивают **ход мысли**, а не только готовый код: думай вслух, уточняй условия, проверяй себя примерами.
- Порядок: уточнить задачу → привести пример входа и выхода → набросать подход → написать → проверить на крайних случаях.
- На system design иди по чек-листу: **требования → оценки → API → данные → компоненты → масштабирование → отказы → компромиссы**.`,
    },
    {
      t: 'md',
      detail: true,
      text: `## Как вести себя на live coding

1. **Повтори условие своими словами** и задай уточняющие вопросы: что на входе, какие ограничения, что делать при ошибке.
2. **Сначала пример.** Разбери одну-две пары «вход → выход» на словах.
3. **Опиши подход** до написания кода и оцени сложность.
4. **Пиши маленькими шагами**, называй переменные понятно, проговаривай решения.
5. **Проверь себя**: пустой вход, один элемент, ошибка, повторный вызов.
6. Если застрял, скажи, что именно непонятно, и предложи упрощённый вариант.`,
    },
    {
      t: 'md',
      text: `## Тренажёр: async-утилиты

Четыре классические задачи. Тесты запускаются в браузере на управляемых часах: \`advance(100)\` двигает виртуальное время, настоящих пауз нет. Не подглядывай в решение, пока не прошёл хотя бы подсказки.`,
    },
    { t: 'task', task: { id: '14.5a', title: 'retry с паузой', mode: 'browser', summary: 'Напиши `retry(fn, { retries, delay })`: повторяет асинхронную функцию при ошибке с паузой между попытками и бросает последнюю ошибку после исчерпания попыток.', testExercise: retryExercise, hints: ['Попытки удобно считать циклом `for`, а не рекурсией.', 'Пауза: `await new Promise((r) => setTimeout(r, delay))`.', 'Бросай ошибку, когда попыток больше нет, а не после паузы.'] } },
    { t: 'task', task: { id: '14.5b', title: 'pLimit: ограничение параллелизма', mode: 'browser', summary: 'Напиши `pLimit(n)`: возвращает функцию, которая запускает задачи так, чтобы одновременно работало не больше n.', testExercise: pLimitExercise, hints: ['Нужны очередь ожидающих задач и счётчик активных.', 'Когда задача завершилась (успешно или с ошибкой), уменьши счётчик и запусти следующую.', 'Не забудь пробросить результат и ошибку в промис, который вернул `limit`.'] } },
    { t: 'task', task: { id: '14.5c', title: 'debounce', mode: 'browser', summary: 'Напиши `debounce(fn, wait)`: вызывает `fn` только после паузы в `wait` мс без новых вызовов, с аргументами последнего вызова.', testExercise: debounceExercise, hints: ['Храни идентификатор таймера в замыкании.', 'Каждый вызов сначала отменяет прежний таймер через `clearTimeout`.'] } },
    { t: 'task', task: { id: '14.5d', title: 'memoize', mode: 'browser', summary: 'Напиши `memoize(fn)`: кэширует результат по набору аргументов. Ошибки не кэшируются, а результат `undefined` кэшируется.', testExercise: memoizeExercise, hints: ['Ключ можно получить через `JSON.stringify(args)`; запомни ограничения такого ключа.', 'Для проверки наличия используй `Map.has`, а не сравнение значения с `undefined`.'] } },
    {
      t: 'md',
      text: `## System design: чек-лист

1. **Требования.** Функциональные (что делает система) и нефункциональные (нагрузка, задержки, доступность, согласованность). Что **не** входит в задачу.
2. **Оценки.** Запросы в секунду на чтение и запись, объём данных, пик к среднему. Грубые порядки величин.
3. **API.** Ресурсы и методы, идемпотентность, пагинация, ошибки.
4. **Модель данных.** Сущности, индексы, выбор хранилища под паттерн доступа.
5. **Компоненты.** Клиент, API, сервисы, БД, кэш, очередь. Что синхронно, что через брокер.
6. **Масштабирование.** Реплики, шардирование, кэш, партиции.
7. **Отказы.** Что если упала БД, брокер, внешняя система; повторы, таймауты, деградация.
8. **Компромиссы.** Назови, чем платишь за каждое решение.

Тренировочные задачи: сокращатель ссылок, очередь уведомлений, лента заявок с интеграцией во внешнюю систему, rate limiter как сервис.`,
    },
    {
      t: 'widget',
      name: 'diagram-canvas',
      props: { spec: demoDiagram },
      model: true,
      caption: 'Пример схемы для разбора отказов: нажми на узел, чтобы его уронить, и включи защиту у сервисов. Используй такую схему на собеседовании как основу для разговора об отказоустойчивости.',
    },
    {
      t: 'interview',
      q: 'Как вы подходите к задаче на live coding, если не знаете решения сразу?',
      a: `- Повторить условие и уточнить ограничения.
- Разобрать пример вслух и предложить самый простой рабочий подход (даже неоптимальный).
- Назвать сложность и узкие места, затем улучшить.
- Говорить, что непонятно, а не молчать.
- Проверять решение на крайних случаях.`,
    },
    {
      t: 'interview',
      q: 'Спроектируйте очередь уведомлений (email, push). С чего начнёте?',
      a: `- Требования: объёмы, гарантии доставки, приоритеты, шаблоны, каналы.
- Принимающий API кладёт задачу в брокер (at-least-once), отправщики по каналам читают из очередей.
- Идемпотентность: ключ уведомления, чтобы повтор не отправил письмо дважды.
- Ретраи с растущей паузой, DLQ для «ядовитых» сообщений.
- Ограничение скорости на стороне провайдеров, мониторинг глубины очереди и доли ошибок.`,
    },
    {
      t: 'task',
      task: {
        id: '14.6',
        title: 'Сорвать план: разбор отказов схемы',
        mode: 'browser',
        summary: 'В схеме выше роняй по очереди каждый узел и отвечай вслух: что перестанет работать, что деградирует, что продолжит работать. Затем включи защиту у сервисов и проверь, как изменится картина. Сформулируй, какие механизмы стоят за «защитой» в реальной системе.',
        check: ['Объяснил, почему асинхронная связь не передаёт отказ вызывающему', 'Назвал механизмы защиты: таймауты, circuit breaker, fallback, ретраи с ограничением', 'Понимаешь, что схема упрощённая модель, а не симуляция нагрузки'],
      },
    },
    {
      t: 'task',
      task: {
        id: '14.7',
        title: 'System design по чек-листу',
        mode: 'browser',
        summary: 'Выбери одну из тренировочных задач (например, сокращатель ссылок). За 30 минут пройди чек-лист из восьми пунктов письменно в заметках к этому уроку, затем перескажи вслух за 10 минут. Отдельно выпиши три вопроса, которые уточнил бы у интервьюера.',
        check: ['Пройдены все восемь пунктов чек-листа', 'Названы компромиссы для каждого ключевого решения', 'Рассмотрены отказы хотя бы двух компонентов'],
      },
    },
    {
      t: 'quiz',
      id: 'm14-l03',
      title: 'Проверь себя: live coding и system design',
      questions: [
        { q: 'С чего лучше начать решение задачи на live coding?', options: ['Сразу писать код', 'С уточнения условия и разбора примера', 'С оптимизации', 'С выбора библиотеки'], answer: 1, explain: 'Уточнение и пример исключают недопонимание и показывают структурное мышление.' },
        { q: 'Что делает debounce?', options: ['Вызывает функцию не чаще раза в интервал, пропуская лишние', 'Вызывает функцию ровно один раз', 'Откладывает вызов навсегда', 'Вызывает функцию после паузы без новых вызовов'], answer: 3, explain: 'Debounce ждёт «тишины»: пока вызовы идут, таймер сбрасывается. Ограничение частоты — это throttle.' },
        { q: 'Что должен делать pLimit(2), если одна из задач завершилась ошибкой?', options: ['Остановить всю очередь', 'Повторить задачу бесконечно', 'Освободить слот и запустить следующую задачу, ошибку отдать вызывающему', 'Игнорировать ошибку'], answer: 2, explain: 'Слот должен освобождаться при любом исходе, иначе очередь зависнет.' },
        { q: 'Какой шаг system design идёт сразу после требований?', options: ['Выбор языка', 'Оценки нагрузки и объёмов', 'Развёртывание в облаке', 'Нарисовать красивую схему'], answer: 1, explain: 'Оценки определяют, нужны ли шардирование, кэш и очереди.' },
        { q: 'Почему результат undefined нужно кэшировать в memoize?', options: ['Иначе функция будет вызываться повторно для такого входа', 'Это требование JavaScript', 'Чтобы сэкономить память', 'Не нужно кэшировать'], answer: 0, explain: 'Проверка «есть ли значение» через сравнение с undefined ошибётся; надёжнее Map.has.' },
      ],
    },
  ],
};
