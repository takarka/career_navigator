import type { Lesson, TestExercise } from '../types.ts';
import { varyAnswers } from '../quizutil.ts';

const onceEx: TestExercise = {
  starter: `export function once(fn) {\n  // Верни функцию, которая вызывает fn только при первом вызове и далее возвращает тот же результат.\n}\n`,
  tests: [
    { name: 'fn вызывается один раз', code: `let n = 0;\nconst f = once(() => ++n);\nf(); f(); f();\nexpect(n).toBe(1);` },
    { name: 'повторные вызовы возвращают первый результат', code: `const f = once((x) => x * 2);\nexpect(f(5)).toBe(10);\nexpect(f(100)).toBe(10);` },
    { name: 'результат undefined тоже запоминается', code: `let n = 0;\nconst f = once(() => { n++; });\nf(); f();\nexpect(n).toBe(1);` },
  ],
  solution: `export function once(fn) {\n  let called = false;\n  let result;\n  return (...args) => {\n    if (!called) {\n      called = true;\n      result = fn(...args);\n    }\n    return result;\n  };\n}\n`,
};

const curryEx: TestExercise = {
  starter: `export function curry(fn) {\n  // Верни каррированную версию: curry(f)(1)(2)(3) и curry(f)(1, 2)(3) равны f(1, 2, 3).\n  // Количество аргументов — fn.length.\n}\n`,
  tests: [
    { name: 'по одному аргументу', code: `const add = curry((a, b, c) => a + b + c);\nexpect(add(1)(2)(3)).toBe(6);` },
    { name: 'сразу несколько аргументов', code: `const add = curry((a, b, c) => a + b + c);\nexpect(add(1, 2)(3)).toBe(6);\nexpect(add(1, 2, 3)).toBe(6);` },
    { name: 'частичное применение переиспользуется', code: `const add = curry((a, b) => a + b);\nconst inc = add(1);\nexpect(inc(1)).toBe(2);\nexpect(inc(10)).toBe(11);` },
  ],
  solution: `export function curry(fn) {\n  const curried = (...args) => (args.length >= fn.length ? fn(...args) : (...more) => curried(...args, ...more));\n  return curried;\n}\n`,
};

const allEx: TestExercise = {
  starter: `export function promiseAll(promises) {\n  // Своя реализация Promise.all: результат — массив значений в исходном порядке;\n  // при первой ошибке промис отклоняется этой ошибкой. Пустой массив даёт [].\n}\n`,
  tests: [
    { name: 'значения в исходном порядке независимо от времени', code: `const slow = new Promise((r) => setTimeout(() => r('a'), 100));\nconst fast = new Promise((r) => setTimeout(() => r('b'), 10));\nconst p = promiseAll([slow, fast, 3]);\nawait advance(100);\nexpect(await p).toEqual(['a', 'b', 3]);` },
    { name: 'первая ошибка отклоняет результат', code: `const p = promiseAll([Promise.resolve(1), Promise.reject(new Error('boom'))]);\nawait expect(p).rejects.toThrow('boom');` },
    { name: 'пустой массив', code: `expect(await promiseAll([])).toEqual([]);` },
  ],
  solution: `export function promiseAll(promises) {\n  return new Promise((resolve, reject) => {\n    const items = [...promises];\n    const out = new Array(items.length);\n    let left = items.length;\n    if (left === 0) return resolve(out);\n    items.forEach((p, i) => {\n      Promise.resolve(p).then((v) => {\n        out[i] = v;\n        if (--left === 0) resolve(out);\n      }, reject);\n    });\n  });\n}\n`,
};

const timeoutEx: TestExercise = {
  starter: `export function withTimeout(promise, ms) {\n  // Верни промис: результат promise, но если он не завершился за ms мс, отклонись ошибкой «timeout».\n}\n`,
  tests: [
    { name: 'быстрый промис проходит', code: `const p = withTimeout(new Promise((r) => setTimeout(() => r('ok'), 50)), 100);\nawait advance(50);\nexpect(await p).toBe('ok');` },
    { name: 'медленный отклоняется по таймауту', code: `const p = withTimeout(new Promise((r) => setTimeout(() => r('late'), 500)), 100);\nconst a = expect(p).rejects.toThrow('timeout');\nawait advance(100);\nawait a;` },
    { name: 'ошибка исходного промиса пробрасывается', code: `const p = withTimeout(Promise.reject(new Error('fail')), 100);\nawait expect(p).rejects.toThrow('fail');` },
  ],
  solution: `export function withTimeout(promise, ms) {\n  return new Promise((resolve, reject) => {\n    const t = setTimeout(() => reject(new Error('timeout')), ms);\n    promise.then(\n      (v) => { clearTimeout(t); resolve(v); },\n      (e) => { clearTimeout(t); reject(e); },\n    );\n  });\n}\n`,
};

export const closures: Lesson = {
  id: 'm02-l01',
  blocks: [
    { t: 'md', text: `## Главное за минуту

- **Замыкание** — функция вместе с лексическим окружением, где она создана: она помнит переменные внешних функций.
- **\`this\`** определяется **способом вызова**: метод объекта, \`call/apply/bind\`, \`new\`; у **стрелочной** функции своего \`this\` нет, берётся из окружающего кода.
- **Прототипы:** объект ищет свойство по цепочке \`__proto__\`; \`class\` — синтаксис над прототипами.
- **Равенство:** \`===\` без приведения типов; \`==\` приводит и даёт неожиданное. \`NaN !== NaN\`, проверка — \`Number.isNaN\`.` },
    { t: 'task', task: { id: '2.1a', title: 'once', mode: 'browser', summary: 'Напиши `once(fn)`: вызывает `fn` только один раз и возвращает запомненный результат.', testExercise: onceEx, hints: ['Состояние (вызвана ли, результат) живёт в замыкании.', 'Флаг «вызвана» нужен, потому что результат может быть undefined.'] } },
    { t: 'task', task: { id: '2.1b', title: 'curry', mode: 'browser', summary: 'Напиши `curry(fn)`: каррирование по `fn.length` с поддержкой передачи нескольких аргументов за раз.', testExercise: curryEx, hints: ['Копи аргументы и вызывай `fn`, когда их хватает.', 'Рекурсивная вспомогательная функция, принимающая накопленные аргументы.'] } },
    { t: 'md', detail: true, text: `## Классические ловушки

- \`var\` в цикле: все колбэки видят одну переменную; \`let\` создаёт привязку на итерацию.
- Потеря \`this\` при передаче метода как колбэка: \`setTimeout(obj.method, 0)\` вызовет его без \`obj\`. Решения: \`bind\`, стрелка.
- Замыкание удерживает большие объекты (утечки памяти, см. m10-l03).
- Мутабельные значения по умолчанию и общие ссылки: копируй (\`structuredClone\`, spread) там, где нужна независимость.` },
    { t: 'interview', q: 'Что такое замыкание и где оно подводит?', a: `Замыкание — функция вместе с лексическим окружением, в котором она создана: она сохраняет доступ к его переменным, даже когда внешняя функция завершилась. Применение: фабрики, приватное состояние, мемоизация, каррирование. Ловушки: удержание больших объектов (утечки памяти) и \`var\` в цикле, где все колбэки делят одну переменную; \`let\` создаёт новую привязку на каждой итерации.` },
    { t: 'interview', q: 'Как определяется this и чем отличается стрелочная функция?', a: `У обычной функции \`this\` зависит от способа вызова: вызов как метода объекта, \`call/apply/bind\`, конструктор \`new\`; при простом вызове в строгом режиме — undefined. У стрелочной функции своего \`this\` нет: он берётся лексически из окружающего кода, поэтому её нельзя переопределить через \`bind\` и нельзя использовать как конструктор.` },
    { t: 'quiz', id: 'm02-l01', title: 'Проверь себя: замыкания и this', questions: varyAnswers([
      { q: 'Что выведет цикл for (var i=0;i<3;i++) setTimeout(()=>console.log(i))?', options: ['0 1 2', '3 3 3', '2 2 2', 'ничего'], answer: 1, explain: 'var одна на все итерации; с let было бы 0 1 2.' },
      { q: 'Чему равен this в стрелочной функции?', options: ['Всегда window', 'this окружающего кода', 'undefined всегда', 'Объекту вызова'], answer: 1, explain: 'Лексический this.' },
      { q: 'Чем опасно замыкание?', options: ['Ничем', 'Может удерживать большие объекты и вызывать утечки', 'Нельзя использовать в async', 'Медленнее на 10 раз'], answer: 1, explain: 'Ссылки в окружении не освобождаются.' },
      { q: 'Как проверить NaN?', options: ['x === NaN', 'Number.isNaN(x)', 'x == NaN', 'typeof x'], answer: 1, explain: 'NaN не равен самому себе.' },
      { q: 'Что делает bind?', options: ['Вызывает функцию', 'Возвращает новую функцию с зафиксированным this и аргументами', 'Копирует объект', 'Создаёт промис'], answer: 1, explain: 'Решает потерю контекста.' },
    ]) },
  ],
};

export const asyncPatterns: Lesson = {
  id: 'm02-l02',
  blocks: [
    { t: 'md', text: `## Главное за минуту

- **Комбинаторы:** \`Promise.all\` (все, падает на первой ошибке), \`allSettled\` (все статусы), \`race\` (первый завершившийся), \`any\` (первый успешный; все упали — \`AggregateError\`). Они **не отменяют** остальные операции: для отмены — \`AbortController\`.
- **Параллельно или последовательно:** независимые операции запускай одновременно, но с **ограничением параллелизма** (см. \`pLimit\` в m14-l03).
- **Ошибки:** \`try/catch\` вокруг \`await\`; необработанный reject завершает процесс (m01-l06). \`async\`-функция всегда возвращает промис.
- **Таймаут и отмена** — обязательная часть обращения к внешним системам.` },
    { t: 'task', task: { id: '2.2a', title: 'Свой Promise.all', mode: 'browser', summary: 'Реализуй `promiseAll(promises)`: значения в исходном порядке, первая ошибка отклоняет результат, пустой массив даёт `[]`. Элементы могут быть не промисами.', testExercise: allEx, hints: ['Результаты складывай по индексу, а не по порядку завершения.', 'Считай оставшиеся промисы и завершай, когда счётчик дойдёт до нуля.'] } },
    { t: 'task', task: { id: '2.2b', title: 'withTimeout', mode: 'browser', summary: 'Реализуй `withTimeout(promise, ms)`: результат исходного промиса или ошибка `timeout`. Таймер нужно очищать.', testExercise: timeoutEx, hints: ['Нужен таймер, который отклоняет промис.', 'Не забудь очистить таймер при любом исходе исходного промиса.'] } },
    { t: 'md', detail: true, text: `## Подробности

- \`await\` в цикле выполняет операции **последовательно**; для параллельного запуска собери промисы в массив и \`await Promise.all\`.
- \`forEach\` с \`async\`-колбэком **не ждёт** завершения: используй \`for…of\` с await или \`Promise.all(map(...))\`.
- **Микрозадачи и порядок выполнения** подробно в m01-l02.
- **Отмена:** \`AbortController\`/\`AbortSignal\` принимают \`fetch\`, \`timers/promises\`, потоки; \`AbortSignal.timeout(ms)\` создаёт сигнал с таймаутом.` },
    { t: 'interview', q: 'Чем отличаются Promise.all, allSettled, race и any?', a: `\`all\` ждёт все и отклоняется на первой ошибке; \`allSettled\` ждёт все и возвращает статусы, не падает; \`race\` завершается результатом первого завершившегося промиса, успешным или нет; \`any\` ждёт первого успешного и отклоняется \`AggregateError\`, только если упали все. Ни один из них не отменяет остальные операции: для этого нужен \`AbortController\`.` },
    { t: 'interview', q: 'Почему async-колбэк в forEach не работает как ожидается?', a: `\`forEach\` не знает о возвращаемых промисах и не ждёт их: цикл завершается сразу, а операции идут «в фоне»; ошибки превращаются в необработанные reject. Нужен \`for…of\` с \`await\` (последовательно) или \`await Promise.all(items.map(async …))\` (параллельно, с ограничением параллелизма при большом числе).` },
    { t: 'quiz', id: 'm02-l02', title: 'Проверь себя: async-паттерны', questions: varyAnswers([
      { q: 'Что вернёт Promise.any, если все промисы отклонены?', options: ['undefined', 'AggregateError', 'Первую ошибку', 'Пустой массив'], answer: 1, explain: 'Ошибки собираются в AggregateError.' },
      { q: 'Отменяет ли Promise.race остальные операции?', options: ['Да', 'Нет', 'Только таймеры', 'Только fetch'], answer: 1, explain: 'Нужна явная отмена через AbortController.' },
      { q: 'Как выполнить 3 независимых запроса параллельно?', options: ['await подряд', 'await Promise.all([...])', 'forEach с await', 'setTimeout'], answer: 1, explain: 'Параллельный запуск и ожидание всех.' },
      { q: 'Что вернёт async-функция?', options: ['Значение', 'Всегда промис', 'undefined', 'Колбэк'], answer: 1, explain: 'Возвращаемое значение оборачивается в промис.' },
      { q: 'Зачем очищать таймер в withTimeout?', options: ['Для красоты', 'Чтобы не держать процесс и не отклонять уже завершённый промис', 'Нужно по спецификации', 'Ускоряет'], answer: 1, explain: 'Иначе таймер живёт и мешает завершению.' },
    ]) },
  ],
};

export const typescript: Lesson = {
  id: 'm02-l03',
  blocks: [
    { t: 'md', text: `## Главное за минуту

- TypeScript проверяет типы **при компиляции**; во время выполнения типов нет. Данные из сети нужно **валидировать** (см. m06-l03).
- **\`unknown\`** безопасен (нужно сузить перед использованием), **\`any\`** отключает проверки, **\`never\`** — значение, которого не бывает (исчерпывающие \`switch\`).
- **Структурная типизация:** совместимость по форме, а не по имени.
- **Generics** связывают типы входа и выхода; **utility types**: \`Partial\`, \`Required\`, \`Readonly\`, \`Pick\`, \`Omit\`, \`Record\`, \`ReturnType\`, \`Awaited\`.
- **Сужение типов:** \`typeof\`, \`instanceof\`, \`in\`, дискриминированные объединения, пользовательские type guards.` },
    { t: 'md', text: `## Примеры

\`\`\`ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parse(s: string): Result<number> {
  const n = Number(s);
  return Number.isNaN(n) ? { ok: false, error: 'не число' } : { ok: true, value: n };
}

const r = parse('42');
if (r.ok) r.value.toFixed(); else r.error.toUpperCase();   // сужение по дискриминанту ok

function assertNever(x: never): never { throw new Error('необработанный вариант: ' + String(x)); }

type PublicUser = Omit<User, 'passwordHash'>;
type Patch = Partial<Pick<User, 'name' | 'email'>>;
function first<T>(xs: T[]): T | undefined { return xs[0]; }
\`\`\`

**Настройки:** \`"strict": true\` включает строгие проверки (рекомендуется всегда); \`noUncheckedIndexedAccess\` делает доступ по индексу \`T | undefined\`.` },
    { t: 'widget', name: 'match-game', props: { options: ['Partial<T>', 'Pick<T, K>', 'Omit<T, K>', 'Record<K, V>', 'ReturnType<F>', 'Awaited<T>'], items: [
      { label: 'Все поля сделать необязательными (DTO для PATCH)', answer: 'Partial<T>', why: 'Каждое свойство получает ?.' },
      { label: 'Оставить только поля id и name', answer: 'Pick<T, K>', why: 'Выбирает подмножество ключей.' },
      { label: 'Убрать passwordHash из публичной модели', answer: 'Omit<T, K>', why: 'Исключает перечисленные ключи.' },
      { label: 'Словарь «идентификатор → значение»', answer: 'Record<K, V>', why: 'Объект с заданными типами ключей и значений.' },
      { label: 'Тип результата функции без дублирования описания', answer: 'ReturnType<F>', why: 'Извлекает тип возврата.' },
      { label: 'Тип значения, которое вернёт промис', answer: 'Awaited<T>', why: 'Разворачивает вложенные промисы.' },
    ] }, caption: 'Выбери подходящий utility type.' },
    { t: 'interview', q: 'Чем unknown отличается от any? Когда использовать never?', a: `\`any\` отключает проверку типов и «заражает» код. \`unknown\` безопасен: значение нельзя использовать, пока тип не сужен (\`typeof\`, \`instanceof\`, type guard, валидатор схемы). Для данных извне (JSON, тело запроса, ошибка в catch) беру \`unknown\` и валидирую. \`never\` — тип недостижимого: ветка исчерпывающей проверки в \`switch\`, функция, которая всегда бросает исключение. Присвоение в \`never\` в \`default\` заставляет компилятор указать на необработанный вариант.` },
    { t: 'interview', q: 'Что такое структурная типизация и дискриминированное объединение?', a: `Структурная типизация: типы совместимы, если совпадает форма (набор свойств), а не имя. Дискриминированное объединение — объединение объектных типов с общим литеральным полем-признаком (\`ok: true | false\`, \`kind: 'a' | 'b'\`): проверка признака сужает тип до нужного варианта, и компилятор следит за исчерпывающей обработкой.` },
    { t: 'task', task: { id: '2.3', title: 'Опиши типы', mode: 'browser', summary: 'Опиши в заметках типы для API заказов: `Order`, DTO создания (без `id` и `createdAt`), DTO обновления (все поля необязательны), публичный тип без служебных полей и `Result<T>` для операций. Назови utility types, которые использовал.', widget: { name: 'match-game', props: { options: ['Partial<T>', 'Pick<T, K>', 'Omit<T, K>', 'Record<K, V>'], items: [
      { label: 'DTO обновления: те же поля, но все необязательные', answer: 'Partial<T>', why: 'Partial делает свойства необязательными.' },
      { label: 'DTO создания: Order без id и createdAt', answer: 'Omit<T, K>', why: 'Исключаем служебные поля.' },
      { label: 'Краткая карточка: только id и status', answer: 'Pick<T, K>', why: 'Выбираем подмножество.' },
      { label: 'Словарь заказов по идентификатору', answer: 'Record<K, V>', why: 'Словарь с типизированными ключами.' },
    ] } }, hints: ['Какие поля задаёт сервер, а какие клиент?', 'Что общего у DTO создания и обновления?'], check: ['Типы выражены через utility types, а не копированием', 'Есть Result<T> с дискриминантом'] } },
    { t: 'quiz', id: 'm02-l03', title: 'Проверь себя: TypeScript', questions: varyAnswers([
      { q: 'Существует ли тип во время выполнения?', options: ['Да', 'Нет, типы стираются при компиляции', 'Только интерфейсы', 'Только классы'], answer: 1, explain: 'Поэтому данные из сети нужно валидировать.' },
      { q: 'Что безопаснее: any или unknown?', options: ['any', 'unknown', 'одинаково', 'never'], answer: 1, explain: 'unknown требует сужения перед использованием.' },
      { q: 'Для чего never в default ветки switch?', options: ['Для скорости', 'Чтобы компилятор показал необработанный вариант', 'Для логов', 'Не нужно'], answer: 1, explain: 'Присвоение в never провалится при новом варианте.' },
      { q: 'Что делает Omit<User, "passwordHash">?', options: ['Удаляет поле из БД', 'Создаёт тип без этого поля', 'Делает поле необязательным', 'Копирует объект'], answer: 1, explain: 'Это операция над типом, а не над данными.' },
      { q: 'Что включает strict?', options: ['Минификацию', 'Набор строгих проверок типов', 'Строгий режим JS только', 'Линтер'], answer: 1, explain: 'Рекомендуется для всех проектов.' },
    ]) },
  ],
};

export const decorators: Lesson = {
  id: 'm02-l04',
  blocks: [
    { t: 'md', text: `## Главное за минуту

- **Декоратор** — функция, которая оборачивает или аннотирует класс, метод, свойство или параметр. В NestJS на них построены \`@Controller\`, \`@Injectable\`, \`@Get\`.
- Существуют **две реализации**: «экспериментальные» декораторы TypeScript (\`experimentalDecorators\`) и стандартные декораторы ECMAScript. **NestJS использует экспериментальные**, поэтому в \`tsconfig\` нужен \`experimentalDecorators\` (в этом репозитории он включён, чтобы запускать настоящие приложения Nest в тестах).
- Для внедрения зависимостей **по типу** нужен \`emitDecoratorMetadata\` и пакет \`reflect-metadata\`: компилятор записывает типы параметров конструктора. Не все транспайлеры это умеют (esbuild — нет).
- Декоратор — это просто вызов функции: \`@Controller('t') class A {}\` равносильно \`Controller('t')(A)\`. В тестах этого учебника компоненты Nest собираются именно так.` },
    { t: 'md', text: `## Пример простого декоратора метода

\`\`\`ts
function Log(target: object, key: string, desc: PropertyDescriptor) {
  const original = desc.value;
  desc.value = function (...args: unknown[]) {
    console.log(key, args);
    return original.apply(this, args);
  };
}

class Service {
  @Log
  sum(a: number, b: number) { return a + b; }
}
\`\`\`

Декоратор получает прототип класса, имя метода и дескриптор: подменяет \`desc.value\` обёрткой. Метаданные для Nest (\`@Get()\`, \`@UseGuards()\`) записываются через \`Reflect.defineMetadata\`, а фреймворк читает их при старте и строит маршруты и граф зависимостей.` },
    { t: 'interview', q: 'Что такое декораторы и как они используются в NestJS?', a: `Декоратор — функция, применяемая к классу, методу, свойству или параметру для их оборачивания или аннотирования метаданными. В NestJS декораторы записывают метаданные (маршруты, guards, пайпы, зависимости), а фреймворк читает их при старте и строит приложение. Nest использует экспериментальные декораторы TypeScript (\`experimentalDecorators\`) и \`reflect-metadata\`; для внедрения по типу нужен \`emitDecoratorMetadata\`.` },
    { t: 'interview', q: 'Почему DI в Nest может не работать при сборке через esbuild?', a: `Внедрение по типу конструктора опирается на метаданные типов, которые выпускает компилятор TypeScript при \`emitDecoratorMetadata\`. esbuild такие метаданные не выпускает, поэтому типы параметров неизвестны, и Nest не может разрешить зависимости. Решения: собирать через \`tsc\` или SWC либо указывать токены явно через \`@Inject()\`.` },
    { t: 'task', task: { id: '2.4', title: 'Декоратор как функция', mode: 'browser', summary: 'Перепиши в заметках `@Controller("t") class A {}` и `@Get() handle() {}` в виде обычных вызовов функций без синтаксиса `@`. Объясни, что при этом получает каждая функция (класс, прототип, имя, дескриптор).', widget: { name: 'match-game', props: { options: ['класс', 'прототип, имя, дескриптор', 'прототип, имя, индекс'], items: [
      { label: 'Что получает декоратор класса (@Controller)', answer: 'класс', why: 'Сам конструктор класса.' },
      { label: 'Что получает декоратор метода (@Get, @UseGuards на методе)', answer: 'прототип, имя, дескриптор', why: 'Целевой объект, имя метода и дескриптор свойства.' },
      { label: 'Что получает декоратор параметра (@Query, @Body)', answer: 'прототип, имя, индекс', why: 'Прототип, имя метода и номер параметра.' },
    ] } }, hints: ['Декоратор — обычная функция, вызываемая при определении класса.', 'Посмотри, как собирается приложение в src/engine/nest-fixture/app.ts.'], check: ['Переписал декораторы вызовами функций', 'Назвал аргументы для класса, метода и параметра'] } },
    { t: 'quiz', id: 'm02-l04', title: 'Проверь себя: декораторы', questions: varyAnswers([
      { q: 'Какие декораторы использует NestJS?', options: ['Стандартные ECMAScript', 'Экспериментальные TypeScript (experimentalDecorators)', 'Никакие', 'Только классовые'], answer: 1, explain: 'Поэтому нужен experimentalDecorators.' },
      { q: 'Для чего reflect-metadata?', options: ['Для логов', 'Для хранения и чтения метаданных декораторов', 'Для HTTP', 'Для тестов'], answer: 1, explain: 'Nest читает метаданные при старте.' },
      { q: 'Что нужно для DI по типу параметра конструктора?', options: ['Ничего', 'emitDecoratorMetadata при компиляции', 'Только JS', 'Docker'], answer: 1, explain: 'Компилятор записывает типы параметров.' },
      { q: 'Чему равен @Dec class A {}?', options: ['Dec(A)', 'new Dec(A)', 'Dec.A', 'A(Dec)'], answer: 0, explain: 'Декоратор класса — вызов функции с классом.' },
      { q: 'Что получает декоратор метода первым аргументом?', options: ['Экземпляр', 'Прототип класса', 'Имя', 'Дескриптор'], answer: 1, explain: 'Целевой объект: прототип (для статических — конструктор).' },
    ]) },
  ],
};
