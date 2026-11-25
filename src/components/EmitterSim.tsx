import { useMemo, useState } from 'preact/hooks';
import { emitterScenarios, emitterSource, simulateEmitter } from '../engine/emitter.ts';
import { SimPlayer } from './SimPlayer.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import { Markdown } from './Markdown.tsx';
import { useDark } from '../app/theme.ts';

/** Визуализатор EventEmitter: список слушателей и журнал вызовов по шагам. Модель сверена с реальным Node автотестом. */
export function EmitterSim() {
  const dark = useDark();
  const [si, setSi] = useState(0);
  const [step, setStep] = useState(0);
  const sc = emitterScenarios[si];
  const sim = useMemo(() => simulateEmitter(sc.ops), [sc]);
  const source = useMemo(() => emitterSource(sc.ops), [sc]);
  const f = sim.frames[Math.min(step, sim.frames.length - 1)];
  const last = step >= sim.frames.length - 1;

  return (
    <div class="emsim">
      <div class="sim-pick" role="group" aria-label="Сценарий">
        {emitterScenarios.map((s, i) => (
          <button key={s.id} class={`chip-btn ${i === si ? 'on' : ''}`} aria-pressed={i === si} onClick={() => { setSi(i); setStep(0); }}>{s.title}</button>
        ))}
      </div>
      <p class="muted">{sc.intro}</p>
      <CodeEditor value={source} readOnly dark={dark} label="Код сценария" />
      <SimPlayer total={sim.frames.length} index={step} setIndex={setStep} resetKey={sc.id} />
      <div class="sim-step" aria-live="polite"><b>Шаг {step + 1} из {sim.frames.length}.</b> {f.title}</div>
      <div class="grid2">
        <div>
          <div class="pane-title">Слушатели</div>
          {Object.keys(f.listeners).length === 0 ? <span class="empty">нет</span> : (
            <ul class="listeners">
              {Object.entries(f.listeners).map(([ev, arr]) => (
                <li key={ev}><code>{ev}</code> ({arr.length}): {arr.map((l, i) => <span key={i} class="chip">{l.id}{l.once ? ' (once)' : ''}</span>)}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div class="pane-title">Вывод программы</div>
          {f.log.length === 0 ? <span class="empty">пусто</span> : <ol class="outlog">{f.log.map((l, i) => <li key={i}>{l}</li>)}</ol>}
        </div>
      </div>
      {last && <div class="explain-open"><b>Разбор</b><ol>{sc.explanation.map((e, i) => <li key={i}><Markdown text={e} inline /></li>)}</ol></div>}
    </div>
  );
}
