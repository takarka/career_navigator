import { useMemo, useState } from 'preact/hooks';
import * as B from '../engine/btree.ts';
import { scenarios, simulate, type Level } from '../engine/isolation.ts';
import { SimPlayer } from './SimPlayer.tsx';
import { Timeline } from './Timeline.tsx';
import type { TimelineSpec } from '../engine/timeline.ts';


/* ---------- B-tree ---------- */
function NodeView({ n, hl }: { n: B.BNode; hl: Set<number> }) {
  return (
    <div class="bnode-wrap">
      <div class={`bnode ${n.leaf ? 'leaf' : ''} ${hl.has(n.id) ? 'hl' : ''}`} title={n.leaf ? 'лист' : 'внутренний узел'}>
        {n.keys.map((k) => <span key={k} class="bkey">{k}</span>)}
        {n.keys.length === 0 && <span class="empty">пусто</span>}
      </div>
      {!n.leaf && <div class="bchildren">{n.children.map((c) => <NodeView key={c.id} n={c} hl={hl} />)}</div>}
    </div>
  );
}

export function BTreeViz() {
  const [maxKeys, setMaxKeys] = useState(3);
  const [seq, setSeq] = useState('10, 20, 5, 6, 12, 30, 7, 17, 3, 25, 8, 14');
  const keys = useMemo(() => seq.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && seq.trim() !== ''), [seq]);
  const [step, setStep] = useState(keys.length);
  const [q, setQ] = useState('');
  const shown = Math.min(step, keys.length);
  const tree = useMemo(() => keys.slice(0, shown).reduce((t, k) => B.insert(t, k), B.createTree(maxKeys)), [keys, shown, maxKeys]);
  const sr = q.trim() !== '' && Number.isFinite(Number(q)) ? B.search(tree, Number(q)) : null;
  return (
    <div class="btreeviz">
      <div class="row wrap">
        <label>Ключей в узле: <b>{maxKeys}</b><input type="range" min={2} max={6} value={maxKeys} onInput={(e) => { setMaxKeys(Number((e.target as HTMLInputElement).value)); setStep(keys.length); }} /></label>
        <label>Ключи для вставки по порядку <input value={seq} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setSeq(v); setStep(1e9); }} style={{ width: '22em', maxWidth: '100%' }} /></label>
        <label>Найти ключ <input value={q} inputMode="numeric" onInput={(e) => setQ((e.target as HTMLInputElement).value)} style={{ width: '5em' }} /></label>
      </div>
      <SimPlayer total={keys.length + 1} index={shown} setIndex={setStep} resetKey={`${seq}-${maxKeys}`} />
      <div class="btree-scroll"><NodeView n={tree.root} hl={new Set(sr?.path ?? [])} /></div>
      <p aria-live="polite">
        Вставлено ключей: <b>{shown}</b> из {keys.length}. Высота: <b>{B.height(tree)}</b>. {shown > 0 && tree.lastSplits > 0 && `Последняя вставка разделила узлов: ${tree.lastSplits}. `}
        {sr && (sr.found ? <>Ключ найден за <b>{sr.path.length}</b> чтений узлов (путь подсвечен).</> : <>Ключа нет: проверено <b>{sr.path.length}</b> узлов.</>)}
      </p>
      <p class="model-note">Учебная модель B+-дерева. В PostgreSQL узел — страница 8 КБ с сотнями ключей, поэтому высота индекса по миллионам строк обычно 3–4 уровня.</p>
    </div>
  );
}

/* ---------- Изоляция ---------- */
const levels: Level[] = ['read committed', 'repeatable read', 'serializable'];
const levelRu: Record<Level, string> = { 'read committed': 'Read Committed', 'repeatable read': 'Repeatable Read', serializable: 'Serializable' };

export function IsolationSim() {
  const [si, setSi] = useState(0);
  const [level, setLevel] = useState<Level>('read committed');
  const [step, setStep] = useState(0);
  const sc = scenarios[si];
  const out = useMemo(() => simulate(sc, level), [sc, level]);
  const shown = out.steps.slice(0, step + 1);
  const last = step >= out.steps.length - 1;
  return (
    <div class="isosim">
      <div class="row wrap">
        <label>Сценарий
          <select value={String(si)} onChange={(e) => { setSi(Number((e.target as HTMLSelectElement).value)); setStep(0); }}>
            {scenarios.map((s, i) => <option key={s.id} value={String(i)}>{s.title}</option>)}
          </select>
        </label>
        <label>Уровень изоляции
          <select value={level} onChange={(e) => { setLevel((e.target as HTMLSelectElement).value as Level); setStep(0); }}>
            {levels.map((l) => <option key={l} value={l}>{levelRu[l]}</option>)}
          </select>
        </label>
      </div>
      <p class="muted">{sc.intro} Начальное состояние: {Object.entries(sc.initial).map(([k, v]) => `${k} = ${v}`).join(', ')}.</p>
      <SimPlayer total={out.steps.length} index={step} setIndex={setStep} resetKey={`${sc.id}-${level}`} />
      <div class="grid2 isocols">
        {(['T1', 'T2'] as const).map((s) => (
          <div key={s}>
            <div class="pane-title">Сессия {s}</div>
            <ol class="outlog">
              {shown.filter((x) => x.op.s === s).map((x, i) => <li key={i} class={x.error ? 'bad-text' : x.blocked ? 'muted' : ''}>{x.text.replace(`${s}: `, '')}</li>)}
            </ol>
          </div>
        ))}
      </div>
      {last && (
        <div class="explain-open" aria-live="polite">
          <b>Итог.</b> Зафиксировано: {Object.entries(out.final).map(([k, v]) => `${k} = ${v}`).join(', ')}.
          {out.aborted.length > 0 && <> Прервана сессия: <b>{out.aborted.join(', ')}</b> (нужен повтор транзакции).</>}
        </div>
      )}
      <p class="model-note">Модель поведения PostgreSQL (MVCC, снимки, SSI в упрощении). Те же сценарии выполняются на реальном PostgreSQL лабораторией <code>labs/m03/isolation</code> (в CI); в среде разработки она не запускалась.</p>
    </div>
  );
}

/* ---------- Дедлок ---------- */

const deadlock: TimelineSpec = {
  lanes: [{ id: 't1', title: 'Транзакция 1' }, { id: 't2', title: 'Транзакция 2' }, { id: 'pg', title: 'PostgreSQL' }],
  events: [
    { id: 'a', lane: 't1', at: 0, label: 'UPDATE строку A', kind: 'ok', step: 0 },
    { id: 'b', lane: 't2', at: 1, label: 'UPDATE строку B', kind: 'ok', step: 1 },
    { id: 'c', lane: 't1', at: 2, label: 'UPDATE B: ждёт T2', kind: 'wait', step: 2 },
    { id: 'd', lane: 't2', at: 3, label: 'UPDATE A: ждёт T1', kind: 'wait', step: 3 },
    { id: 'e', lane: 'pg', at: 4, label: 'цикл ожиданий найден', kind: 'info', step: 4 },
    { id: 'f', lane: 't2', at: 5, label: 'ОШИБКА 40P01, откат', kind: 'bad', step: 5 },
    { id: 'g', lane: 't1', at: 6, label: 'UPDATE B выполнен', kind: 'ok', step: 6 },
  ],
  arrows: [{ from: 'a', to: 'd', label: 'держит A' }, { from: 'b', to: 'c', label: 'держит B' }],
  steps: [
    { title: 'T1 блокирует A', text: 'Первая транзакция обновляет строку A и держит её блокировку до конца транзакции.' },
    { title: 'T2 блокирует B', text: 'Вторая транзакция обновляет строку B.' },
    { title: 'T1 ждёт B', text: 'T1 пытается обновить B и ждёт, пока T2 снимет блокировку.' },
    { title: 'T2 ждёт A', text: 'T2 пытается обновить A: теперь каждая транзакция ждёт другую.' },
    { title: 'Обнаружение', text: 'Проверка запускается после deadlock_timeout (по умолчанию 1 секунда): PostgreSQL находит цикл ожиданий.' },
    { title: 'Жертва', text: 'Одна из транзакций прерывается с ошибкой 40P01 (deadlock detected); приложение должно повторить транзакцию.' },
    { title: 'Вторая завершается', text: 'Блокировки жертвы сняты, T1 продолжает и завершается.' },
  ],
};

export function DeadlockTimeline() {
  return <Timeline spec={deadlock} id="deadlock-tl" />;
}
