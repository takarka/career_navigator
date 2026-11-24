/**
 * Модель event loop Node.js (CommonJS-скрипт, Node ≥ 11).
 *
 * Сценарий описывается деревом операций (Op). Из одного и того же дерева
 *  - генерируется настоящий JS-код (toSource) — его мы запускаем в реальном Node
 *    и сверяем с результатом модели (см. eventloop.test.ts);
 *  - строится пошаговая запись выполнения (simulate) для визуализатора.
 *
 * Время виртуальное. Модель намеренно упрощена: нет фаз pending/close,
 * I/O — это одна операция с фиксированной задержкой.
 */

export type Op =
  | { k: 'log'; text: string }
  | { k: 'timeout'; delay: number; body: Op[] }
  | { k: 'immediate'; body: Op[] }
  | { k: 'nextTick'; body: Op[] }
  | { k: 'promise'; body: Op[] } // Promise.resolve().then(...)
  | { k: 'chain'; steps: Op[][] } // Promise.resolve().then(a).then(b)...
  | { k: 'microtask'; body: Op[] } // queueMicrotask(...)
  | { k: 'io'; body: Op[] } // fs.readFile(__filename, cb)
  | { k: 'async'; body: Op[] } // (async () => { ... })()
  | { k: 'await' };

export interface Scenario {
  id: string;
  title: string;
  /** Короткая подводка перед заданием. */
  intro: string;
  ops: Op[];
  /** false — в реальном Node порядок может отличаться между запусками. */
  deterministic: boolean;
  /** Разбор: почему порядок именно такой (по пунктам). */
  explanation: string[];
}

/* ------------------------------------------------------------------ */
/* Генератор исходного кода                                            */
/* ------------------------------------------------------------------ */

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function usesIo(ops: Op[]): boolean {
  return ops.some((op) => {
    if (op.k === 'io') return true;
    if (op.k === 'chain') return op.steps.some(usesIo);
    if ('body' in op) return usesIo(op.body);
    return false;
  });
}

function gen(ops: Op[], ind: string): string {
  const pad = ind;
  const block = (body: Op[]) => gen(body, ind + '  ');
  const lines: string[] = [];
  for (const op of ops) {
    switch (op.k) {
      case 'log':
        lines.push(`${pad}console.log(${q(op.text)});`);
        break;
      case 'timeout':
        lines.push(`${pad}setTimeout(() => {\n${block(op.body)}\n${pad}}, ${op.delay});`);
        break;
      case 'immediate':
        lines.push(`${pad}setImmediate(() => {\n${block(op.body)}\n${pad}});`);
        break;
      case 'nextTick':
        lines.push(`${pad}process.nextTick(() => {\n${block(op.body)}\n${pad}});`);
        break;
      case 'promise':
        lines.push(`${pad}Promise.resolve().then(() => {\n${block(op.body)}\n${pad}});`);
        break;
      case 'microtask':
        lines.push(`${pad}queueMicrotask(() => {\n${block(op.body)}\n${pad}});`);
        break;
      case 'io':
        lines.push(`${pad}fs.readFile(__filename, () => {\n${block(op.body)}\n${pad}});`);
        break;
      case 'chain': {
        const parts = op.steps.map((s) => `${pad}  .then(() => {\n${gen(s, ind + '    ')}\n${pad}  })`);
        lines.push(`${pad}Promise.resolve()\n${parts.join('\n')};`);
        break;
      }
      case 'async':
        lines.push(`${pad}(async () => {\n${block(op.body)}\n${pad}})();`);
        break;
      case 'await':
        lines.push(`${pad}await null;`);
        break;
    }
  }
  return lines.join('\n');
}

/** Исходный код CommonJS-файла для сценария. */
export function toSource(ops: Op[], withHeader = true): string {
  const head = withHeader && usesIo(ops) ? "const fs = require('node:fs');\n\n" : '';
  return head + gen(ops, '');
}

/* ------------------------------------------------------------------ */
/* Модель                                                              */
/* ------------------------------------------------------------------ */

export type Phase = 'start' | 'main' | 'nextTick' | 'microtask' | 'timers' | 'poll' | 'check';

export interface QItem {
  id: number;
  label: string;
  /** Момент готовности (только таймеры и I/O), мс виртуального времени. */
  ready?: number;
}

export interface Frame {
  title: string;
  phase: Phase;
  /** Выполненный на этом шаге колбэк. */
  running?: string;
  /** Что колбэк успел зарегистрировать. */
  scheduled: string[];
  nextTick: QItem[];
  microtask: QItem[];
  timers: QItem[];
  poll: QItem[];
  check: QItem[];
  log: string[];
  now: number;
}

interface Task {
  id: number;
  label: string;
  ops: Op[];
  /** Для цепочек then: выполнить после завершения. */
  after?: () => void;
  ready?: number;
  seq: number;
}

function hint(ops: Op[]): string {
  const first = findLog(ops);
  return first ? ` «${first}»` : '';
}
function findLog(ops: Op[]): string | undefined {
  for (const op of ops) {
    if (op.k === 'log') return op.text;
    if (op.k === 'chain') {
      const r = findLog(op.steps[0] ?? []);
      if (r) return r;
    } else if ('body' in op) {
      const r = findLog(op.body);
      if (r) return r;
    }
  }
  return undefined;
}

const IO_LATENCY = 2;

export function simulate(ops: Op[]): { frames: Frame[]; log: string[] } {
  let now = 0;
  let nextId = 1;
  let seq = 0;
  const log: string[] = [];
  const frames: Frame[] = [];
  const tickQ: Task[] = [];
  const microQ: Task[] = [];
  let timers: Task[] = [];
  let ioPending: Task[] = [];
  let ioReady: Task[] = [];
  let immediates: Task[] = [];
  let scheduled: string[] = [];

  const view = (t: Task): QItem => ({ id: t.id, label: t.label, ready: t.ready });

  const snap = (title: string, phase: Phase, running?: string) => {
    frames.push({
      title,
      phase,
      running,
      scheduled,
      nextTick: tickQ.map(view),
      microtask: microQ.map(view),
      timers: [...timers].sort((a, b) => a.ready! - b.ready! || a.seq - b.seq).map(view),
      poll: [...ioPending, ...ioReady].map(view),
      check: immediates.map(view),
      log: [...log],
      now,
    });
    scheduled = [];
  };

  const mk = (label: string, body: Op[], extra: Partial<Task> = {}): Task => ({
    id: nextId++,
    label,
    ops: body,
    seq: seq++,
    ...extra,
  });

  const runSeq = (seqOps: Op[]) => {
    for (let i = 0; i < seqOps.length; i++) {
      const op = seqOps[i];
      switch (op.k) {
        case 'log':
          log.push(op.text);
          break;
        case 'timeout': {
          const t = mk(`setTimeout(${op.delay})${hint(op.body)}`, op.body, { ready: now + Math.max(1, op.delay) });
          timers.push(t);
          scheduled.push(`setTimeout(${op.delay}) → очередь таймеров`);
          break;
        }
        case 'immediate':
          immediates.push(mk(`setImmediate${hint(op.body)}`, op.body));
          scheduled.push('setImmediate → очередь check');
          break;
        case 'nextTick':
          tickQ.push(mk(`nextTick${hint(op.body)}`, op.body));
          scheduled.push('nextTick → очередь nextTick');
          break;
        case 'promise':
          microQ.push(mk(`then${hint(op.body)}`, op.body));
          scheduled.push('Promise.then → очередь микрозадач');
          break;
        case 'microtask':
          microQ.push(mk(`queueMicrotask${hint(op.body)}`, op.body));
          scheduled.push('queueMicrotask → очередь микрозадач');
          break;
        case 'io':
          ioPending.push(mk(`readFile cb${hint(op.body)}`, op.body, { ready: now + IO_LATENCY }));
          scheduled.push('readFile → поток ОС, колбэк придёт в фазе poll');
          break;
        case 'chain': {
          const pushStep = (n: number) => {
            const step = op.steps[n];
            const task = mk(`then #${n + 1}${hint(step)}`, step);
            if (n + 1 < op.steps.length) task.after = () => pushStep(n + 1);
            microQ.push(task);
            scheduled.push(`then #${n + 1} → очередь микрозадач`);
          };
          if (op.steps.length) pushStep(0);
          break;
        }
        case 'async':
          runSeq(op.body);
          break;
        case 'await': {
          const rest = seqOps.slice(i + 1);
          microQ.push(mk(`продолжение после await${hint(rest)}`, rest));
          scheduled.push('await → продолжение в очередь микрозадач');
          return;
        }
      }
    }
  };

  const runTask = (t: Task) => {
    runSeq(t.ops);
    t.after?.();
  };

  const drain = (phaseAfter: Phase) => {
    do {
      while (tickQ.length) {
        const t = tickQ.shift()!;
        runTask(t);
        snap(`Выполнен колбэк из очереди nextTick`, 'nextTick', t.label);
      }
      while (microQ.length) {
        const t = microQ.shift()!;
        runTask(t);
        snap(`Выполнена микрозадача`, 'microtask', t.label);
      }
    } while (tickQ.length);
    void phaseAfter;
  };

  /* --- старт --- */
  snap('Старт: скрипт загружен, стек пуст', 'start');
  runSeq(ops);
  snap('Основной скрипт выполнен (синхронный код)', 'main', 'основной скрипт');
  drain('main');
  now = 1; // к моменту запуска цикла прошла ≈1 мс

  /* --- цикл --- */
  let guard = 0;
  while ((timers.length || ioPending.length || ioReady.length || immediates.length) && guard++ < 200) {
    /* timers */
    const due = timers.filter((t) => t.ready! <= now).sort((a, b) => a.ready! - b.ready! || a.seq - b.seq);
    for (const t of due) {
      timers = timers.filter((x) => x !== t);
      runTask(t);
      snap('Фаза timers: сработал таймер', 'timers', t.label);
      drain('timers');
    }

    /* poll */
    const arrive = () => {
      const done = ioPending.filter((t) => t.ready! <= now);
      ioPending = ioPending.filter((t) => !done.includes(t));
      ioReady.push(...done);
    };
    arrive();
    if (!ioReady.length && !immediates.length && (timers.length || ioPending.length)) {
      const nextT = Math.min(...[...timers, ...ioPending].map((t) => t.ready!));
      now = Math.max(now, nextT);
      scheduled = [`цикл ждёт в фазе poll до t=${now} мс`];
      snap('Фаза poll: нет работы — цикл ждёт', 'poll');
      arrive();
    }
    while (ioReady.length) {
      const t = ioReady.shift()!;
      runTask(t);
      snap('Фаза poll: I/O-колбэк', 'poll', t.label);
      drain('poll');
    }

    /* check */
    const batch = immediates;
    immediates = [];
    for (const t of batch) {
      runTask(t);
      snap('Фаза check: setImmediate', 'check', t.label);
      drain('check');
    }
  }

  snap('Очереди пусты — процесс завершается', 'start');
  return { frames, log };
}
