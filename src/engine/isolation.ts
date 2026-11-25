/**
 * Модель изоляции транзакций PostgreSQL (MVCC) для двух сессий над таблицей kv(k, v).
 * Поддерживаются уровни Read Committed, Repeatable Read (снимок на транзакцию, как в PostgreSQL)
 * и Serializable (SSI: упрощённое обнаружение опасных rw-зависимостей).
 * Это модель логики, а не реализация PostgreSQL: нет планировщика, индексов и настоящих блокировок строк.
 * Сценарии одновременно описываются абстрактными операциями и рендерятся в SQL для проверки на реальном PostgreSQL
 * (labs/m03/isolation, запускается в CI).
 */
export type Level = 'read committed' | 'repeatable read' | 'serializable';
export type Sess = 'T1' | 'T2';

export type Op =
  | { s: Sess; op: 'begin' }
  | { s: Sess; op: 'read'; k: string }
  /** Установить значение: UPDATE kv SET v = <value> WHERE k = ... Значение может зависеть от прочитанного: add относительно последнего read этой сессии. */
  | { s: Sess; op: 'write'; k: string; value: number }
  | { s: Sess; op: 'writeFromRead'; k: string; delta: number }
  | { s: Sess; op: 'forUpdate'; k: string }
  | { s: Sess; op: 'count'; pred: 'all' | 'positive' }
  | { s: Sess; op: 'insert'; k: string; value: number }
  | { s: Sess; op: 'commit' };

export interface Scenario {
  id: string;
  title: string;
  intro: string;
  initial: Record<string, number>;
  ops: Op[];
}

export interface StepResult {
  op: Op;
  text: string;
  /** Для чтений: прочитанное значение. */
  value?: number;
  /** Сессия получила ошибку. */
  error?: string;
  /** Операция заблокирована до коммита другой сессии. */
  blocked?: boolean;
}

export interface Outcome {
  steps: StepResult[];
  /** Итоговое закоммиченное состояние. */
  final: Record<string, number>;
  aborted: Sess[];
}

interface Version {
  v: number;
  by: Sess | 'init';
  commitSeq: number | null;
}

interface Tx {
  active: boolean;
  snapshotSeq: number | null;
  reads: Set<string>;
  writes: Set<string>;
  lastRead: Record<string, number>;
  countReads: boolean;
  failed: boolean;
  committedAt: number | null;
}

const SERIALIZE = 'could not serialize access due to concurrent update';
const SSI = 'could not serialize access due to read/write dependencies among transactions';

export function simulate(sc: Scenario, level: Level): Outcome {
  const table = new Map<string, Version[]>();
  let seq = 0;
  for (const [k, v] of Object.entries(sc.initial)) table.set(k, [{ v, by: 'init', commitSeq: 0 }]);
  const tx: Record<Sess, Tx> = {
    T1: { active: false, snapshotSeq: null, reads: new Set(), writes: new Set(), lastRead: {}, countReads: false, failed: false, committedAt: null },
    T2: { active: false, snapshotSeq: null, reads: new Set(), writes: new Set(), lastRead: {}, countReads: false, failed: false, committedAt: null },
  };
  const steps: StepResult[] = [];
  const aborted: Sess[] = [];
  const other = (s: Sess): Sess => (s === 'T1' ? 'T2' : 'T1');
  const pending: { op: Op; resume: () => void }[] = [];

  const visible = (k: string, s: Sess): number | undefined => {
    const versions = table.get(k) ?? [];
    const own = [...versions].reverse().find((x) => x.by === s && x.commitSeq === null);
    if (own) return own.v;
    const snap = level === 'read committed' ? Infinity : (tx[s].snapshotSeq ?? Infinity);
    const committed = [...versions].filter((x) => x.commitSeq !== null && x.commitSeq <= snap);
    return committed.length ? committed[committed.length - 1].v : undefined;
  };
  const uncommittedBy = (k: string): Sess | undefined => (table.get(k) ?? []).find((x) => x.commitSeq === null && x.by !== 'init')?.by as Sess | undefined;
  const takeSnapshot = (s: Sess) => {
    if (level !== 'read committed' && tx[s].snapshotSeq === null) tx[s].snapshotSeq = seq;
  };
  const abort = (s: Sess) => {
    for (const versions of table.values()) {
      const i = versions.findIndex((x) => x.by === s && x.commitSeq === null);
      if (i >= 0) versions.splice(i, 1);
    }
    tx[s].active = false;
    tx[s].failed = true;
    aborted.push(s);
  };
  const log = (op: Op, text: string, extra: Partial<StepResult> = {}) => steps.push({ op, text, ...extra });

  const exec = (op: Op): 'done' | 'blocked' => {
    const t = tx[op.s];
    if (t.failed && op.op !== 'commit') {
      log(op, `${op.s}: транзакция уже прервана, команды игнорируются до ROLLBACK`);
      return 'done';
    }
    switch (op.op) {
      case 'begin':
        t.active = true;
        log(op, `${op.s}: BEGIN (${level})`);
        return 'done';
      case 'read': {
        takeSnapshot(op.s);
        const v = visible(op.k, op.s);
        t.reads.add(op.k);
        if (v !== undefined) t.lastRead[op.k] = v;
        log(op, `${op.s}: читает ${op.k} → ${v}`, { value: v });
        return 'done';
      }
      case 'count': {
        takeSnapshot(op.s);
        const n = [...table.keys()].filter((k) => {
          const v = visible(k, op.s);
          return v !== undefined && (op.pred === 'all' || v > 0);
        }).length;
        t.countReads = true;
        log(op, `${op.s}: считает строки (${op.pred === 'all' ? 'все' : 'v > 0'}) → ${n}`, { value: n });
        return 'done';
      }
      case 'insert': {
        takeSnapshot(op.s);
        table.set(op.k, [...(table.get(op.k) ?? []), { v: op.value, by: op.s, commitSeq: null }]);
        t.writes.add(op.k);
        log(op, `${op.s}: вставляет ${op.k} = ${op.value} (пока не зафиксировано)`);
        return 'done';
      }
      case 'write':
      case 'writeFromRead':
      case 'forUpdate': {
        takeSnapshot(op.s);
        const holder = uncommittedBy(op.k);
        if (holder && holder !== op.s) return 'blocked'; // ждём коммит или откат другой сессии
        const versions = table.get(op.k) ?? [];
        const latest = [...versions].filter((x) => x.commitSeq !== null).pop();
        // конфликт обновления: строку изменили после нашего снимка
        if (level !== 'read committed' && latest && t.snapshotSeq !== null && latest.commitSeq! > t.snapshotSeq && latest.by !== op.s) {
          log(op, `${op.s}: ОШИБКА — ${SERIALIZE}`, { error: SERIALIZE });
          abort(op.s);
          return 'done';
        }
        // в Read Committed после ожидания перечитываем актуальное значение строки
        const base = latest?.v ?? 0;
        if (op.op === 'forUpdate') {
          t.reads.add(op.k);
          t.lastRead[op.k] = base;
          // блокировка строки до конца транзакции: помечаем «неподтверждённой» копией того же значения
          versions.push({ v: base, by: op.s, commitSeq: null });
          table.set(op.k, versions);
          t.writes.add(op.k);
          log(op, `${op.s}: SELECT ${op.k} FOR UPDATE → ${base} (строка заблокирована)`, { value: base });
          return 'done';
        }
        const value = op.op === 'write' ? op.value : (t.lastRead[op.k] ?? base) + op.delta;
        versions.push({ v: value, by: op.s, commitSeq: null });
        table.set(op.k, versions);
        t.writes.add(op.k);
        log(op, `${op.s}: UPDATE ${op.k} = ${value}${op.op === 'writeFromRead' ? ` (из прочитанного ${t.lastRead[op.k] ?? base} ${op.delta >= 0 ? '+' : ''}${op.delta})` : ''} (пока не зафиксировано)`);
        return 'done';
      }
      case 'commit': {
        if (t.failed) {
          log(op, `${op.s}: COMMIT → откат (транзакция прервана ранее)`);
          return 'done';
        }
        // SSI: опасная структура — другая транзакция уже зафиксировалась после моего снимка,
        // и между нами есть rw-зависимости в обе стороны (каждая читала то, что пишет другая): прерывается тот, кто фиксируется вторым
        if (level === 'serializable') {
          const oc = tx[other(op.s)];
          const iReadWhatOtherWrites = [...t.reads].some((k) => oc.writes.has(k)) || (t.countReads && oc.writes.size > 0);
          const otherReadsWhatIWrite = [...oc.reads].some((k) => t.writes.has(k)) || (oc.countReads && t.writes.size > 0);
          const otherCommittedConcurrently = oc.committedAt !== null && t.snapshotSeq !== null && oc.committedAt > t.snapshotSeq;
          if (otherCommittedConcurrently && iReadWhatOtherWrites && otherReadsWhatIWrite) {
            log(op, `${op.s}: ОШИБКА при COMMIT — ${SSI}`, { error: SSI });
            abort(op.s);
            return 'done';
          }
        }
        seq++;
        for (const versions of table.values()) for (const x of versions) if (x.by === op.s && x.commitSeq === null) x.commitSeq = seq;
        t.active = false;
        t.committedAt = seq;
        log(op, `${op.s}: COMMIT`);
        return 'done';
      }
    }
  };

  const run = (op: Op) => {
    if (pending.length && pending[0].op.s === op.s) {
      // сессия заблокирована: её следующие команды ждут
      pending.push({ op, resume: () => {} });
      log(op, `${op.s}: ждёт — предыдущая команда заблокирована`, { blocked: true });
      return;
    }
    const r = exec(op);
    if (r === 'blocked') {
      log(op, `${op.s}: ${describe(op)} — ЖДЁТ: строка занята другой транзакцией`, { blocked: true });
      pending.push({ op, resume: () => {} });
    }
    // после коммита или отката могут освободиться заблокированные
    if (op.op === 'commit' || tx[op.s].failed) release();
  };

  const release = () => {
    let progressed = true;
    while (progressed && pending.length) {
      progressed = false;
      const p = pending[0];
      const r = exec(p.op);
      if (r === 'done') {
        pending.shift();
        progressed = true;
        steps[steps.length - 1].text += ' (после ожидания)';
        // выполняем накопленные команды этой же сессии
        while (pending.length && pending[0].op.s === p.op.s) {
          const q = pending.shift()!;
          exec(q.op);
        }
      }
    }
  };

  for (const op of sc.ops) run(op);
  release();

  const final: Record<string, number> = {};
  for (const [k, versions] of table) {
    const c = versions.filter((x) => x.commitSeq !== null);
    if (c.length) final[k] = c[c.length - 1].v;
  }
  return { steps, final, aborted };
}

function describe(op: Op): string {
  switch (op.op) {
    case 'write':
      return `UPDATE ${op.k} = ${op.value}`;
    case 'writeFromRead':
      return `UPDATE ${op.k} (из прочитанного)`;
    case 'forUpdate':
      return `SELECT ${op.k} FOR UPDATE`;
    default:
      return op.op;
  }
}

/** SQL для реального PostgreSQL (таблица kv(k text primary key, v int)). */
export function renderSql(op: Op, level: Level): string {
  switch (op.op) {
    case 'begin':
      return `BEGIN ISOLATION LEVEL ${level.toUpperCase()}`;
    case 'read':
      return `SELECT v FROM kv WHERE k = '${op.k}'`;
    case 'count':
      return op.pred === 'all' ? `SELECT count(*)::int AS v FROM kv` : `SELECT count(*)::int AS v FROM kv WHERE v > 0`;
    case 'insert':
      return `INSERT INTO kv (k, v) VALUES ('${op.k}', ${op.value})`;
    case 'write':
      return `UPDATE kv SET v = ${op.value} WHERE k = '${op.k}'`;
    case 'writeFromRead':
      return `UPDATE kv SET v = $LAST + ${op.delta} WHERE k = '${op.k}'`;
    case 'forUpdate':
      return `SELECT v FROM kv WHERE k = '${op.k}' FOR UPDATE`;
    case 'commit':
      return 'COMMIT';
  }
}

export const scenarios: Scenario[] = [
  {
    id: 'nonrepeatable',
    title: 'Неповторяющееся чтение',
    intro: 'T1 читает значение дважды, а между чтениями T2 меняет его и фиксирует.',
    initial: { a: 100 },
    ops: [
      { s: 'T1', op: 'begin' },
      { s: 'T1', op: 'read', k: 'a' },
      { s: 'T2', op: 'begin' },
      { s: 'T2', op: 'write', k: 'a', value: 200 },
      { s: 'T2', op: 'commit' },
      { s: 'T1', op: 'read', k: 'a' },
      { s: 'T1', op: 'commit' },
    ],
  },
  {
    id: 'phantom',
    title: 'Фантом',
    intro: 'T1 считает строки с v > 0 дважды, между подсчётами T2 вставляет новую строку.',
    initial: { a: 1, b: 2 },
    ops: [
      { s: 'T1', op: 'begin' },
      { s: 'T1', op: 'count', pred: 'positive' },
      { s: 'T2', op: 'begin' },
      { s: 'T2', op: 'insert', k: 'c', value: 3 },
      { s: 'T2', op: 'commit' },
      { s: 'T1', op: 'count', pred: 'positive' },
      { s: 'T1', op: 'commit' },
    ],
  },
  {
    id: 'lostupdate',
    title: 'Потерянное обновление',
    intro: 'Обе транзакции читают баланс 100 и увеличивают его на 10 и на 20 «из прочитанного».',
    initial: { a: 100 },
    ops: [
      { s: 'T1', op: 'begin' },
      { s: 'T2', op: 'begin' },
      { s: 'T1', op: 'read', k: 'a' },
      { s: 'T2', op: 'read', k: 'a' },
      { s: 'T1', op: 'writeFromRead', k: 'a', delta: 10 },
      { s: 'T2', op: 'writeFromRead', k: 'a', delta: 20 },
      { s: 'T1', op: 'commit' },
      { s: 'T2', op: 'commit' },
    ],
  },
  {
    id: 'lostupdate-lock',
    title: 'Потерянное обновление и FOR UPDATE',
    intro: 'То же, но каждая транзакция читает строку с блокировкой (SELECT … FOR UPDATE).',
    initial: { a: 100 },
    ops: [
      { s: 'T1', op: 'begin' },
      { s: 'T2', op: 'begin' },
      { s: 'T1', op: 'forUpdate', k: 'a' },
      { s: 'T2', op: 'forUpdate', k: 'a' },
      { s: 'T1', op: 'writeFromRead', k: 'a', delta: 10 },
      { s: 'T1', op: 'commit' },
      { s: 'T2', op: 'writeFromRead', k: 'a', delta: 20 },
      { s: 'T2', op: 'commit' },
    ],
  },
  {
    id: 'writeskew',
    title: 'Write skew (перекос записи)',
    intro: 'Правило: хотя бы один из двух врачей должен остаться на дежурстве (a + b ≥ 1). Каждый видит «есть второй» и снимает себя.',
    initial: { a: 1, b: 1 },
    ops: [
      { s: 'T1', op: 'begin' },
      { s: 'T2', op: 'begin' },
      { s: 'T1', op: 'read', k: 'a' },
      { s: 'T1', op: 'read', k: 'b' },
      { s: 'T2', op: 'read', k: 'a' },
      { s: 'T2', op: 'read', k: 'b' },
      { s: 'T1', op: 'write', k: 'a', value: 0 },
      { s: 'T2', op: 'write', k: 'b', value: 0 },
      { s: 'T1', op: 'commit' },
      { s: 'T2', op: 'commit' },
    ],
  },
];
