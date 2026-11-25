/**
 * Обёртка над PGlite (настоящий PostgreSQL в WASM): работает и в браузере, и в Node (автотесты).
 * PGlite — один процесс и одно соединение: параллельные сессии (изоляция, дедлоки) в нём не воспроизводятся.
 */
import type { PGlite } from '@electric-sql/pglite';

export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  /** Время выполнения, мс. */
  ms: number;
  rowCount: number;
  error?: string;
  /** Для EXPLAIN (FORMAT JSON): разобранный план. */
  plan?: PlanNode;
}

export interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Plan Rows'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Actual Total Time'?: number;
  'Total Cost'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Filter'?: string;
  'Index Cond'?: string;
  'Rows Removed by Filter'?: number;
  Plans?: PlanNode[];
  [k: string]: unknown;
}

let ctor: Promise<typeof import('@electric-sql/pglite')> | null = null;

export async function createDb(setupSql: string): Promise<PGlite> {
  ctor ??= import('@electric-sql/pglite');
  const { PGlite: Db } = await ctor;
  const db = new Db();
  await db.waitReady;
  if (setupSql.trim()) await db.exec(setupSql);
  return db;
}

const fmt = (v: unknown): unknown => (typeof v === 'bigint' ? Number(v) : v);

export async function runSql(db: PGlite, sql: string): Promise<SqlResult> {
  const t0 = performance.now();
  try {
    const res = await db.query(sql, [], { rowMode: 'array' });
    const ms = performance.now() - t0;
    const columns = res.fields.map((f) => f.name);
    const rows = (res.rows as unknown[][]).map((r) => r.map((c) => (c !== null && typeof c === 'object' ? JSON.stringify(c) : fmt(c))));
    const result: SqlResult = { columns, rows, ms, rowCount: res.rows.length };
    // EXPLAIN (FORMAT JSON) возвращает один столбец QUERY PLAN с JSON
    if (columns.length === 1 && columns[0] === 'QUERY PLAN' && res.rows.length === 1) {
      const cell = (res.rows as unknown[][])[0][0];
      const parsed = typeof cell === 'string' ? JSON.parse(cell) : cell;
      if (Array.isArray(parsed) && parsed[0]?.Plan) result.plan = parsed[0].Plan as PlanNode;
    }
    return result;
  } catch (e) {
    return { columns: [], rows: [], ms: performance.now() - t0, rowCount: 0, error: (e as Error).message };
  }
}

/** Выполняет несколько операторов подряд (скрипт); возвращает результат последнего оператора, возвращающего строки. */
export async function runScript(db: PGlite, sql: string): Promise<SqlResult> {
  const t0 = performance.now();
  try {
    const results = await db.exec(sql);
    const last = [...results].reverse().find((r) => r.fields.length > 0) ?? results[results.length - 1];
    if (!last) return { columns: [], rows: [], ms: performance.now() - t0, rowCount: 0 };
    const columns = last.fields.map((f) => f.name);
    const rows = (last.rows as Record<string, unknown>[]).map((r) => columns.map((c) => fmt(r[c])));
    return { columns, rows, ms: performance.now() - t0, rowCount: rows.length };
  } catch (e) {
    return { columns: [], rows: [], ms: performance.now() - t0, rowCount: 0, error: (e as Error).message };
  }
}

/** Сравнение результата с ожидаемым: числа сравниваются как числа, порядок строк — по необходимости. */
export function sameResult(actual: SqlResult, expected: { columns: string[]; rows: unknown[][] }, orderMatters: boolean): boolean {
  if (actual.error) return false;
  if (actual.columns.join('|') !== expected.columns.join('|')) return false;
  const norm = (rows: unknown[][]) => rows.map((r) => JSON.stringify(r.map((c) => (typeof c === 'string' && c.trim() !== '' && !Number.isNaN(Number(c)) ? Number(c) : c))));
  const a = norm(actual.rows);
  const e = norm(expected.rows);
  if (a.length !== e.length) return false;
  return orderMatters ? a.every((x, i) => x === e[i]) : [...a].sort().join('\n') === [...e].sort().join('\n');
}

/** Описание проблем плана запроса простыми словами. */
export function planWarnings(root: PlanNode): string[] {
  const out: string[] = [];
  const walk = (n: PlanNode) => {
    const est = n['Plan Rows'];
    const act = n['Actual Rows'];
    if (est !== undefined && act !== undefined) {
      const ratio = Math.max(est, 1) / Math.max(act, 1);
      if (ratio >= 10 || ratio <= 0.1) out.push(`${n['Node Type']}${n['Relation Name'] ? ` по ${n['Relation Name']}` : ''}: оценка строк (${est}) сильно отличается от факта (${act}). Возможно, устарела статистика (ANALYZE).`);
    }
    if (n['Node Type'] === 'Seq Scan' && n['Rows Removed by Filter'] && n['Rows Removed by Filter'] > 1000 && act !== undefined && act < n['Rows Removed by Filter'] / 20) {
      out.push(`Seq Scan по ${n['Relation Name']} отбросил ${n['Rows Removed by Filter']} строк ради ${act}: возможно, поможет индекс по условию «${n.Filter}».`);
    }
    (n.Plans ?? []).forEach(walk);
  };
  walk(root);
  return out;
}
