import { useState } from 'preact/hooks';
import type { TestExercise } from '../content/types.ts';
import { CodeEditor } from './CodeEditor.tsx';
import { runTests, type SuiteOutcome } from '../engine/testharness.ts';
import { useDark } from '../app/theme.ts';
import { toggle } from '../app/state.ts';

export function TestExerciseView({ ex, taskId }: { ex: TestExercise; taskId?: string }) {
  const dark = useDark();
  const [code, setCode] = useState(ex.starter);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<SuiteOutcome | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await runTests(code, ex.tests, ex.timeoutMs ?? 2000);
    setOut(r);
    setBusy(false);
    if (taskId && !r.error && r.results.length === ex.tests.length && r.results.every((x) => x.ok)) toggle('tasks', taskId, true);
  };

  const passed = out?.results.filter((r) => r.ok).length ?? 0;
  const all = !!out && !out.error && out.results.length === ex.tests.length && passed === ex.tests.length;

  return (
    <div class="sandbox test-exercise">
      <CodeEditor value={code} onChange={setCode} dark={dark} minHeight="180px" label="Редактор решения" />
      <div class="row">
        <button class="primary" onClick={run} disabled={busy}>{busy ? 'Тесты идут…' : '▶ Запустить тесты'}</button>
        <button onClick={() => { setCode(ex.starter); setOut(null); }}>Сбросить</button>
        {ex.solution && <button onClick={() => setShowSolution(!showSolution)}>{showSolution ? 'Скрыть решение' : 'Показать решение'}</button>}
      </div>
      {out?.error && <div class="callout warn" role="alert"><b>Ошибка запуска.</b> {out.error}</div>}
      {out && !out.error && (
        <div class="result" aria-live="polite">
          <p><b>{all ? 'Все тесты пройдены.' : `Пройдено ${passed} из ${ex.tests.length}.`}</b></p>
          <ul class="test-list">
            {out.results.map((r) => (
              <li key={r.name} class={r.ok ? 'ok' : 'fail'}>
                <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span> <span class="sr-only">{r.ok ? 'прошёл:' : 'упал:'}</span> {r.name}
                {!r.ok && <div class="muted">{r.message}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {showSolution && ex.solution && <CodeEditor value={ex.solution} readOnly dark={dark} label="Эталонное решение" />}
    </div>
  );
}
