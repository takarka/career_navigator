import { useEffect, useRef, useState } from 'preact/hooks';
import type { PGlite } from '@electric-sql/pglite';
import { datasets } from '../content/m03/datasets.ts';
import type { SqlExercise } from '../content/types.ts';
import { createDb, planWarnings, runScript, runSql, sameResult, type PlanNode, type SqlResult } from '../engine/sql.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { useDark } from '../app/theme.ts';
import { toggle } from '../app/state.ts';

function PlanTree({ node, depth = 0 }: { node: PlanNode; depth?: number }) {
  const t = node['Actual Total Time'];
  return (
    <li>
      <span class="plannode">
        <b>{node['Node Type']}</b>
        {node['Relation Name'] ? ` по ${node['Relation Name']}` : ''}
        {node['Index Name'] ? ` (индекс ${node['Index Name']})` : ''}
        <span class="muted small"> · строк: оценка {node['Plan Rows']}{node['Actual Rows'] !== undefined ? `, факт ${node['Actual Rows']}` : ''}{t !== undefined ? ` · время ${t} мс` : ''}{node['Total Cost'] !== undefined ? ` · стоимость ${node['Total Cost']}` : ''}</span>
        {(node['Index Cond'] || node.Filter) && <span class="muted small"> · {node['Index Cond'] ? `условие индекса: ${node['Index Cond']}` : `фильтр: ${node.Filter}`}</span>}
      </span>
      {node.Plans && <ul>{node.Plans.map((c, i) => <PlanTree key={i} node={c} depth={depth + 1} />)}</ul>}
    </li>
  );
}

/** SQL-песочница на PGlite (настоящий PostgreSQL в WASM). Загружается лениво; в одиночном файле недоступна. */
export function SqlSandbox({ dataset = 'shop', exercise, taskId }: { dataset?: string; exercise?: SqlExercise; taskId?: string }) {
  const dark = useDark();
  const ds = datasets[exercise?.dataset ?? dataset] ?? datasets.empty;
  const [sql, setSql] = useState(exercise?.starter ?? 'SELECT * FROM customers LIMIT 5;');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [res, setRes] = useState<SqlResult | null>(null);
  const [verdict, setVerdict] = useState<'' | 'ok' | 'bad'>('');
  const [busy, setBusy] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const dbRef = useRef<PGlite | null>(null);

  const init = async () => {
    setStatus('loading');
    setRes(null);
    setVerdict('');
    try {
      await dbRef.current?.close().catch(() => {});
      dbRef.current = await createDb(ds.sql);
      setStatus('ready');
    } catch (e) {
      setErr((e as Error).message);
      setStatus('error');
    }
  };
  useEffect(() => {
    void init();
    return () => {
      void dbRef.current?.close().catch(() => {});
    };
  }, [exercise?.dataset, dataset]);

  const run = async () => {
    const db = dbRef.current;
    if (!db) return;
    setBusy(true);
    const multi = sql.trim().replace(/;\s*$/, '').includes(';');
    const r = multi ? await runScript(db, sql) : await runSql(db, sql);
    setRes(r);
    setBusy(false);
    if (!exercise) return;
    let ok = false;
    if ((exercise.kind ?? 'result') === 'plan') {
      if (!r.error) {
        const p = await runSql(db, `EXPLAIN (FORMAT JSON) ${exercise.planQuery}`);
        const text = JSON.stringify(p.plan ?? {});
        ok = !p.error && new RegExp(exercise.planNode!).test(text);
      }
    } else ok = sameResult(r, exercise.expected!, !!exercise.orderMatters);
    setVerdict(ok ? 'ok' : 'bad');
    if (ok && taskId) toggle('tasks', taskId, true);
  };

  const explain = async () => {
    const db = dbRef.current;
    if (!db) return;
    setBusy(true);
    const body = sql.replace(/--.*$/gm, '').trim().replace(/;\s*$/, '');
    // EXPLAIN ANALYZE реально выполняет запрос: изменяющие запросы заворачиваем в транзакцию с откатом
    const dml = /^\s*(insert|update|delete|create|alter|drop|truncate)/i.test(body);
    if (dml) await db.exec('BEGIN');
    const r = await runSql(db, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${body}`);
    if (dml) await db.exec('ROLLBACK');
    setRes(r);
    setBusy(false);
  };

  if (status === 'error') {
    return (
      <div class="callout warn" role="alert">
        <b>SQL-песочница недоступна.</b> Не удалось загрузить PostgreSQL (WASM): {err}. В сборке «один файл» (<code>dist-single</code>) песочница отключена из-за размера (около 16 МБ): открой обычную сборку (<code>dist</code>, GitHub Pages) или выполни задание в локальном PostgreSQL.
      </div>
    );
  }

  return (
    <div class="sqlsandbox">
      <p class="muted small">База: <b>{ds.title}</b>. {ds.description} {status === 'loading' && '(загружаю PostgreSQL…)'}</p>
      <CodeEditor value={sql} onChange={setSql} dark={dark} minHeight="120px" label="SQL-запрос" />
      <div class="row">
        <button class="primary" onClick={run} disabled={busy || status !== 'ready'}>{busy ? 'Выполняется…' : '▶ Выполнить'}</button>
        <button onClick={explain} disabled={busy || status !== 'ready'} title="EXPLAIN (ANALYZE, BUFFERS) для одного запроса: запрос реально выполняется">EXPLAIN ANALYZE</button>
        <button onClick={() => setSql(exercise?.starter ?? '')}>Сбросить запрос</button>
        <button onClick={() => void init()} title="Пересоздать базу с нуля (удалит созданные индексы и изменения)">Сбросить базу</button>
        {exercise && <button onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Скрыть решение' : 'Показать решение'}</button>}
      </div>
      {res?.error && <div class="callout warn" role="alert"><b>Ошибка:</b> {res.error}</div>}
      {res && !res.error && res.plan && (
        <div class="result">
          <div class="pane-title">План выполнения ({res.ms.toFixed(0)} мс на разбор и выполнение)</div>
          <ul class="plantree"><PlanTree node={res.plan} /></ul>
          {planWarnings(res.plan).map((w) => <p key={w} class="callout tip small">💡 {w}</p>)}
        </div>
      )}
      {res && !res.error && !res.plan && (
        <div class="result">
          <div class="pane-title">Результат: строк {res.rowCount}, {res.ms.toFixed(0)} мс</div>
          {res.columns.length > 0 && (
            <div class="table-wrap">
              <table>
                <thead><tr>{res.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{res.rows.slice(0, 50).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c === null ? <i>NULL</i> : String(c)}</td>)}</tr>)}</tbody>
              </table>
              {res.rows.length > 50 && <p class="muted small">Показаны первые 50 строк из {res.rows.length}.</p>}
            </div>
          )}
        </div>
      )}
      {verdict === 'ok' && <div class="callout tip" role="status"><b>Верно!</b> Результат совпал с ожидаемым.</div>}
      {verdict === 'bad' && !res?.error && <div class="callout warn" role="status">Результат не совпал с ожидаемым. Сравни со столбцами и условием задачи.</div>}
      {exercise && (exercise.kind ?? 'result') === 'result' && exercise.expected && (
        <details><summary>Ожидаемый результат</summary>
          <div class="table-wrap"><table><thead><tr>{exercise.expected.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{exercise.expected.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody></table></div>
        </details>
      )}
      {showSolution && exercise && <pre class="solution">{exercise.solution}</pre>}
    </div>
  );
}
