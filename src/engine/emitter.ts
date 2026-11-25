/**
 * Модель EventEmitter из Node.js: порядок слушателей, once, снимок слушателей на время emit,
 * событие error без обработчика и предупреждение о возможной утечке (maxListeners).
 * Из одного описания строится и пошаговая запись (frames), и исходный код для реального Node (toSource).
 */
export type EOp =
  | { k: 'on'; ev: string; id: string; body?: EOp[] }
  | { k: 'once'; ev: string; id: string; body?: EOp[] }
  | { k: 'off'; ev: string; id: string }
  | { k: 'emit'; ev: string }
  | { k: 'max'; n: number };

export interface EFrame {
  title: string;
  /** Слушатели по событиям (id; пометка once). */
  listeners: Record<string, { id: string; once: boolean }[]>;
  log: string[];
}

export interface ESim {
  frames: EFrame[];
  log: string[];
}

interface L {
  id: string;
  once: boolean;
  body: EOp[];
}

const DEFAULT_MAX = 10;

export function simulateEmitter(ops: EOp[]): ESim {
  const lis = new Map<string, L[]>();
  const log: string[] = [];
  const frames: EFrame[] = [];
  let max = DEFAULT_MAX;
  const warned = new Set<string>();
  let pendingWarning = false;

  const snap = (title: string) =>
    frames.push({
      title,
      listeners: Object.fromEntries([...lis].filter(([, v]) => v.length).map(([k, v]) => [k, v.map((l) => ({ id: l.id, once: l.once }))])),
      log: [...log],
    });

  const run = (op: EOp) => {
    switch (op.k) {
      case 'on':
      case 'once': {
        const arr = lis.get(op.ev) ?? [];
        arr.push({ id: op.id, once: op.k === 'once', body: op.body ?? [] });
        lis.set(op.ev, arr);
        if (max > 0 && arr.length > max && !warned.has(op.ev)) {
          warned.add(op.ev);
          pendingWarning = true;
        }
        snap(`${op.k}('${op.ev}', ${op.id})`);
        break;
      }
      case 'off': {
        const arr = lis.get(op.ev) ?? [];
        // как в Node: удаляется последний добавленный экземпляр слушателя
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].id === op.id) {
            arr.splice(i, 1);
            break;
          }
        }
        snap(`off('${op.ev}', ${op.id})`);
        break;
      }
      case 'max':
        max = op.n;
        snap(`setMaxListeners(${op.n})`);
        break;
      case 'emit': {
        const arr = lis.get(op.ev) ?? [];
        if (op.ev === 'error' && arr.length === 0) {
          log.push('исключение: error без обработчика');
          snap(`emit('error') — слушателей нет, выброшено исключение`);
          break;
        }
        const copy = [...arr]; // слушатели на момент emit; изменения во время emit на него не влияют
        for (const l of copy) {
          if (l.once) {
            const cur = lis.get(op.ev) ?? [];
            const i = cur.indexOf(l);
            if (i >= 0) cur.splice(i, 1);
          }
          log.push(`${op.ev}:${l.id}`);
          for (const inner of l.body) run(inner);
        }
        snap(`emit('${op.ev}') — вызвано слушателей: ${copy.length}`);
        break;
      }
    }
  };

  snap('Старт');
  for (const op of ops) run(op);
  if (pendingWarning) {
    log.push('warning: MaxListenersExceededWarning');
    snap('Предупреждение о возможной утечке (приходит после синхронного кода)');
  }
  return { frames, log };
}

const q = (s: string) => `'${s}'`;

function opSource(op: EOp, indent: string): string {
  switch (op.k) {
    case 'on':
    case 'once': {
      const inner = (op.body ?? []).map((b) => opSource(b, indent + '  ')).join('');
      return `${indent}e.${op.k}(${q(op.ev)}, ${op.id.replace(/\W/g, '_')} = () => {\n${indent}  log(${q(`${op.ev}:${op.id}`)});\n${inner}${indent}});\n`;
    }
    case 'off':
      return `${indent}e.off(${q(op.ev)}, ${op.id.replace(/\W/g, '_')});\n`;
    case 'max':
      return `${indent}e.setMaxListeners(${op.n});\n`;
    case 'emit':
      return op.ev === 'error'
        ? `${indent}try { e.emit('error', new Error('boom')); } catch (err) { log('исключение: error без обработчика'); }\n`
        : `${indent}e.emit(${q(op.ev)});\n`;
  }
}

function collectIds(ops: EOp[], out = new Set<string>()): Set<string> {
  for (const op of ops) {
    if (op.k === 'on' || op.k === 'once') {
      out.add(op.id.replace(/\W/g, '_'));
      collectIds(op.body ?? [], out);
    }
  }
  return out;
}

/** Исходный CommonJS-код сценария для реального Node (и для лаборатории). */
export function emitterSource(ops: EOp[]): string {
  const ids = [...collectIds(ops)];
  return [
    `const EventEmitter = require('node:events');`,
    `const e = new EventEmitter();`,
    `const log = (x) => console.log(x);`,
    `process.on('warning', (w) => log('warning: ' + w.name));`,
    ids.length ? `let ${ids.join(', ')};` : '',
    ...ops.map((op) => opSource(op, '').trimEnd()),
    '',
  ]
    .join('\n');
}

export interface EScenario {
  id: string;
  title: string;
  intro: string;
  ops: EOp[];
  explanation: string[];
}

export const emitterScenarios: EScenario[] = [
  {
    id: 'order',
    title: 'Порядок и once',
    intro: 'Слушатели вызываются в порядке добавления; once удаляется перед вызовом.',
    ops: [
      { k: 'on', ev: 'a', id: 'A' },
      { k: 'once', ev: 'a', id: 'B' },
      { k: 'on', ev: 'a', id: 'C' },
      { k: 'emit', ev: 'a' },
      { k: 'emit', ev: 'a' },
    ],
    explanation: ['emit синхронный: слушатели вызываются сразу, по порядку добавления.', 'Слушатель once удаляется до вызова, поэтому при втором emit его уже нет.'],
  },
  {
    id: 'snapshot',
    title: 'Слушатель, добавленный во время emit',
    intro: 'Список слушателей фиксируется на момент emit.',
    ops: [
      { k: 'on', ev: 'a', id: 'A', body: [{ k: 'on', ev: 'a', id: 'New' }] },
      { k: 'emit', ev: 'a' },
      { k: 'emit', ev: 'a' },
    ],
    explanation: ['Во время первого emit добавлен слушатель New, но он не вызывается: в emit используется копия списка.', 'Слушатель A добавляет ещё один New при каждом вызове. Во втором emit New (первый) уже вызывается.'],
  },
  {
    id: 'error',
    title: 'error без обработчика',
    intro: 'Событие error особое: без слушателя emit бросает исключение.',
    ops: [{ k: 'emit', ev: 'error' }, { k: 'on', ev: 'error', id: 'H' }, { k: 'emit', ev: 'error' }],
    explanation: ['Без слушателя события error emit выбрасывает исключение, необработанное оно завершает процесс.', 'С обработчиком ошибка передаётся ему и процесс продолжает работу.'],
  },
  {
    id: 'leak',
    title: 'Утечка слушателей',
    intro: 'После maxListeners (по умолчанию 10) приходит предупреждение.',
    ops: [
      { k: 'max', n: 2 },
      { k: 'on', ev: 'x', id: 'L1' },
      { k: 'on', ev: 'x', id: 'L2' },
      { k: 'on', ev: 'x', id: 'L3' },
      { k: 'on', ev: 'x', id: 'L4' },
    ],
    explanation: ['Предупреждение появляется, когда слушателей на событие становится больше лимита (здесь на третьем), и только один раз для события.', 'Оно приходит асинхронно, после синхронного кода. Лимит по умолчанию — 10, предупреждение про «11 слушателей».'],
  },
];
