import { useState } from 'preact/hooks';
import type { Exercise } from '../content/types.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { runJs, type RunResult } from '../engine/runner.ts';
import { useDark } from '../app/theme.ts';
import { toggle } from '../app/state.ts';

export function Sandbox({ exercise, taskId }: { exercise?: Exercise; taskId?: string }) {
  const dark = useDark();
  const [code, setCode] = useState(exercise?.starter ?? "console.log('привет');\n");
  const [res, setRes] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await runJs(code, exercise?.settleMs ?? 200);
    setRes(r);
    setBusy(false);
    if (exercise && taskId && !r.error && r.logs.join('\n') === exercise.expected.join('\n')) toggle('tasks', taskId, true);
  };

  const ok = exercise && res && !res.error && res.logs.join('\n') === exercise.expected.join('\n');

  return (
    <div class="sandbox">
      <CodeEditor value={code} onChange={setCode} dark={dark} minHeight="140px" />
      <div class="row">
        <button class="primary" onClick={run} disabled={busy}>{busy ? 'Выполняется…' : '▶ Запустить'}</button>
        <button onClick={() => { setCode(exercise?.starter ?? ''); setRes(null); }}>Сбросить</button>
        {exercise?.solution && <button onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Скрыть решение' : 'Показать решение'}</button>}
      </div>
      {exercise && (
        <div class="expected">
          <div class="pane-title">Нужный вывод</div>
          <pre>{exercise.expected.join('\n')}</pre>
        </div>
      )}
      {res && (
        <div class="result">
          <div class="pane-title">Твой вывод</div>
          <pre>{res.logs.join('\n') || '(пусто)'}</pre>
          {res.error && <div class="callout warn"><b>Ошибка:</b> {res.error}</div>}
          {exercise && !res.error && (ok ? <div class="callout tip"><b>Верно!</b> Вывод совпал.</div> : <div class="callout warn">Вывод не совпал с нужным. Сравни построчно.</div>)}
        </div>
      )}
      {showSolution && exercise?.solution && <pre class="solution">{exercise.solution}</pre>}
      <p class="muted small">Код выполняется в изолированном Web Worker. В браузере нет <code>process.nextTick</code> и <code>setImmediate</code>, но Promise, <code>queueMicrotask</code> и <code>setTimeout</code> работают так же, как в Node.js.</p>
    </div>
  );
}
