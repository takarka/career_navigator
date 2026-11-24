import { useMemo, useState } from 'preact/hooks';
import { simulate, toSource, type Frame, type QItem } from '../engine/eventloop.ts';
import { scenarios } from '../content/m01/scenarios.ts';
import { SimPlayer } from './SimPlayer.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import { Markdown } from './Markdown.tsx';
import { useDark } from '../app/theme.ts';

function Lane({ title, hint, items, active, cls }: { title: string; hint?: string; items: QItem[]; active: boolean; cls: string }) {
  return (
    <div class={`lane ${cls} ${active ? 'active' : ''}`}>
      <div class="lane-title">{title}</div>
      {hint && <div class="lane-hint">{hint}</div>}
      <div class="chips">
        {items.length === 0 && <span class="empty">пусто</span>}
        {items.map((it) => (
          <span class="chip" key={it.id}>
            {it.label}
            {it.ready !== undefined && <small> · t={it.ready}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

const phaseName: Record<Frame['phase'], string> = {
  start: 'Старт / конец',
  main: 'Основной скрипт',
  nextTick: 'Очередь nextTick',
  microtask: 'Очередь микрозадач',
  timers: 'Фаза timers',
  poll: 'Фаза poll',
  check: 'Фаза check',
};

export function EventLoopSim({ scenarioId, fixed }: { scenarioId?: string; fixed?: boolean }) {
  const dark = useDark();
  const [sid, setSid] = useState(scenarioId ?? scenarios[0].id);
  const [index, setIndex] = useState(0);
  const sc = scenarios.find((s) => s.id === sid) ?? scenarios[0];
  const sim = useMemo(() => simulate(sc.ops), [sc]);
  const source = useMemo(() => toSource(sc.ops), [sc]);
  const frame = sim.frames[Math.min(index, sim.frames.length - 1)];
  const prevLen = index > 0 ? sim.frames[index - 1].log.length : 0;

  return (
    <div class="sim">
      {!fixed && (
        <div class="sim-pick">
          {scenarios.map((s) => (
            <button key={s.id} class={s.id === sid ? 'chip-btn on' : 'chip-btn'} onClick={() => { setSid(s.id); setIndex(0); }}>
              {s.title}
            </button>
          ))}
        </div>
      )}
      <p class="sim-intro">{sc.intro}</p>
      {!sc.deterministic && (
        <div class="callout warn"><b>Порядок не гарантирован.</b> В симуляторе показан один из возможных вариантов. В реальном Node результат зависит от машины и может меняться между запусками.</div>
      )}
      <div class="sim-cols">
        <div class="sim-code">
          <div class="pane-title">Код (CommonJS)</div>
          <CodeEditor value={source} readOnly dark={dark} />
        </div>
        <div class="sim-state">
          <div class="running">
            <span class="pane-title">Выполняется сейчас</span>
            <span class={`run-label ${frame.running ? '' : 'idle'}`}>{frame.running ?? '—'}</span>
          </div>
          <div class="lane-group">
            <div class="group-title">Между колбэками: очищаются полностью, по очереди</div>
            <Lane cls="tick" title="process.nextTick" hint="сначала" items={frame.nextTick} active={frame.phase === 'nextTick'} />
            <Lane cls="micro" title="Микрозадачи" hint="Promise.then, await, queueMicrotask" items={frame.microtask} active={frame.phase === 'microtask'} />
          </div>
          <div class="lane-group">
            <div class="group-title">Фазы цикла: timers → poll → check</div>
            <div class="phases">
              <Lane cls="timers" title="timers" hint="setTimeout" items={frame.timers} active={frame.phase === 'timers'} />
              <Lane cls="poll" title="poll" hint="I/O" items={frame.poll} active={frame.phase === 'poll'} />
              <Lane cls="check" title="check" hint="setImmediate" items={frame.check} active={frame.phase === 'check'} />
            </div>
          </div>
        </div>
      </div>
      <div class="sim-step" aria-live="polite">
        <b>{frame.title}</b>
        {frame.scheduled.length > 0 && <ul>{frame.scheduled.map((s, i) => <li key={i}>{s}</li>)}</ul>}
        <span class="muted">виртуальное время: {frame.now} мс · {phaseName[frame.phase]}</span>
      </div>
      <div class="sim-log">
        <div class="pane-title">Вывод консоли</div>
        {frame.log.length === 0 && <span class="empty">пока пусто</span>}
        <ol>
          {frame.log.map((l, i) => (
            <li key={i} class={i >= prevLen ? 'new' : ''}>{l}</li>
          ))}
        </ol>
      </div>
      <SimPlayer total={sim.frames.length} index={index} setIndex={setIndex} resetKey={sid} />
      <details class="explain">
        <summary>Разбор: почему такой порядок</summary>
        <ol>{sc.explanation.map((e, i) => <li key={i}><Markdown text={e} inline /></li>)}</ol>
      </details>
      <p class="model-note">Это упрощённая модель event loop. Порядок вывода сверен с реальным запуском Node.js автоматическими тестами.</p>
    </div>
  );
}
