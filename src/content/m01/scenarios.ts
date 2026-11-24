import type { Op, Scenario } from '../../engine/eventloop.ts';

const log = (text: string): Op => ({ k: 'log', text });
const timeout = (delay: number, ...body: Op[]): Op => ({ k: 'timeout', delay, body });
const immediate = (...body: Op[]): Op => ({ k: 'immediate', body });
const nextTick = (...body: Op[]): Op => ({ k: 'nextTick', body });
const promise = (...body: Op[]): Op => ({ k: 'promise', body });
const io = (...body: Op[]): Op => ({ k: 'io', body });
const asyncFn = (...body: Op[]): Op => ({ k: 'async', body });
const wait: Op = { k: 'await' };
const chain = (...steps: Op[][]): Op => ({ k: 'chain', steps });

export const scenarios: Scenario[] = [
  {
    id: 'basics',
    title: 'Четыре очереди',
    intro: 'Классика собеседований: синхронный код, nextTick, промис и таймер.',
    deterministic: true,
    ops: [
      log('script start'),
      timeout(0, log('setTimeout')),
      promise(log('promise.then')),
      nextTick(log('nextTick')),
      log('script end'),
    ],
    explanation: [
      'Сначала до конца выполняется синхронный код: `script start`, затем `script end`. Колбэки только встают в очереди.',
      'Когда стек опустел, Node сначала очищает очередь `process.nextTick`, затем очередь микрозадач (промисы). Поэтому `nextTick` идёт раньше `promise.then`, хотя в коде он записан позже.',
      '`setTimeout` — макрозадача. Он ждёт фазы timers следующего витка цикла, поэтому выполняется последним.',
    ],
  },
  {
    id: 'async-await',
    title: 'async/await',
    intro: 'Что выполняется сразу, а что после await?',
    deterministic: true,
    ops: [
      log('script start'),
      asyncFn(log('f: до await'), wait, log('f: после await')),
      promise(log('promise.then')),
      log('script end'),
    ],
    explanation: [
      'Тело async-функции выполняется синхронно до первого `await`. Поэтому `f: до await` печатается сразу, между `script start` и `script end`.',
      '`await` делает остаток функции микрозадачей и ставит её в очередь. Она встала в очередь раньше, чем `promise.then`, значит, и выполнится раньше.',
      'Правило: `await x` — это «поставь продолжение в очередь микрозадач и отдай управление».',
    ],
  },
  {
    id: 'tick-vs-promise',
    title: 'nextTick и промисы друг в друге',
    intro: 'Колбэки порождают колбэки из соседней очереди. Кто кого пропустит?',
    deterministic: true,
    ops: [
      promise(log('promise 1'), nextTick(log('nextTick внутри promise'))),
      nextTick(log('nextTick 1'), promise(log('promise внутри nextTick'))),
      log('sync'),
    ],
    explanation: [
      'После синхронного кода выполняется `nextTick 1`. Он добавляет новую микрозадачу в конец очереди промисов.',
      'Очередь микрозадач очищается полностью, вместе с теми, что добавлены по ходу: `promise 1`, затем `promise внутри nextTick`.',
      '`nextTick внутри promise` появился во время очистки микрозадач. Он дождётся, пока очередь промисов опустеет, и только потом получит слово.',
      'Правило: nextTick-очередь и очередь микрозадач опустошаются по очереди, пока обе не станут пустыми.',
    ],
  },
  {
    id: 'timers',
    title: 'Таймеры и микрозадачи между ними',
    intro: 'Несколько таймеров и цепочка then. Обрати внимание на промис внутри таймера.',
    deterministic: true,
    ops: [
      timeout(10, log('timeout 10')),
      timeout(0, log('timeout 0'), promise(log('promise в timeout 0'))),
      timeout(0, log('timeout 0 (второй)')),
      chain([log('then 1')], [log('then 2')]),
      log('sync'),
    ],
    explanation: [
      'Сначала `sync`, затем цепочка `then 1 → then 2`: микрозадачи идут раньше любых таймеров.',
      'В фазе timers срабатывают оба таймера с задержкой 0 в порядке регистрации.',
      'Начиная с Node 11 между колбэками таймеров очищаются микрозадачи. Поэтому `promise в timeout 0` выполняется до `timeout 0 (второй)`. До Node 11 порядок был другим, и это любят спрашивать.',
      'Таймер на 10 мс срабатывает позже всех.',
    ],
  },
  {
    id: 'io-phase',
    title: 'I/O: setTimeout против setImmediate',
    intro: 'Колбэк пришёл из ввода-вывода (readFile). Что выполнится раньше?',
    deterministic: true,
    ops: [
      log('start'),
      io(
        log('I/O callback'),
        timeout(0, log('setTimeout')),
        immediate(log('setImmediate')),
        nextTick(log('nextTick')),
        promise(log('promise')),
      ),
      log('end'),
    ],
    explanation: [
      'Колбэк readFile выполняется в фазе poll. После него сразу идёт фаза check, где живёт `setImmediate`. Таймер же ждёт следующего витка цикла.',
      'Внутри I/O-колбэка `setImmediate` всегда раньше `setTimeout(0)`. Это единственный случай, где порядок гарантирован.',
      'До `setImmediate` успевают выполниться `nextTick` и промис: они очищаются сразу после текущего колбэка.',
    ],
  },
  {
    id: 'timeout-vs-immediate',
    title: 'setTimeout(0) против setImmediate в основном модуле',
    intro: 'Знаменитая ловушка. Что выведется первым?',
    deterministic: false,
    ops: [timeout(0, log('setTimeout')), immediate(log('setImmediate'))],
    explanation: [
      'В основном модуле порядок **не гарантирован**. Он зависит от того, успела ли пройти 1 мс к моменту запуска цикла.',
      'Если успела, первым сработает таймер, если нет, первым будет `setImmediate`. В симуляторе показан вариант «таймер первым», но на твоей машине может выйти наоборот. Запусти файл из лаборатории несколько раз и сравни.',
      'Порядок гарантирован только внутри I/O-колбэка (предыдущий сценарий). На собеседовании правильный ответ: «не гарантирован».',
    ],
  },
];
