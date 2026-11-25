import { useState } from 'preact/hooks';
import type { Mode, Task } from '../content/types.ts';
import { Markdown } from './Markdown.tsx';
import { Sandbox } from './Sandbox.tsx';
import { toggle, useProgress } from '../app/state.ts';
import { LazyWidget } from './widgets.tsx';

export const modeInfo: Record<Mode, { icon: string; label: string; hint: string }> = {
  browser: { icon: '🌐', label: 'В браузере', hint: 'Выполняется прямо на этой странице' },
  local: { icon: '💻', label: 'Локально', hint: 'Нужно запустить на своём компьютере' },
  hybrid: { icon: '🔀', label: 'Гибрид', hint: 'Модель в браузере плюс проверка на реальной системе' },
};

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      class="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* буфер недоступен */
        }
      }}
    >
      {ok ? 'Скопировано' : 'Копировать'}
    </button>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const progress = useProgress();
  const [hints, setHints] = useState(0);
  const m = modeInfo[task.mode];
  const done = !!progress.tasks[task.id];

  return (
    <section class={`task ${done ? 'done' : ''}`}>
      <header>
        <span class={`badge ${task.mode}`} title={m.hint}>{m.icon} {m.label}</span>
        <span class="task-id">Задача {task.id}</span>
        <h3>{task.title}</h3>
      </header>
      <Markdown text={task.summary} />
      {task.steps && <ol class="steps">{task.steps.map((s, i) => <li key={i}><Markdown text={s} inline /></li>)}</ol>}
      {task.commands && (
        <div class="cmds">
          {task.commands.map((c, i) => (
            <div class="cmd" key={i}>
              {c.note && <div class="cmd-note">{c.note}</div>}
              <pre><code>{c.cmd}</code></pre>
              <Copy text={c.cmd} />
            </div>
          ))}
        </div>
      )}
      {task.expected && (
        <div class="expected"><div class="pane-title">Что должно получиться</div><Markdown text={task.expected} /></div>
      )}
      {task.widget && <LazyWidget name={task.widget.name} props={{ ...(task.widget.props ?? {}), taskId: task.id }} />}
      {task.exercise && <Sandbox exercise={task.exercise} taskId={task.id} />}
      {task.sqlExercise && <LazyWidget name="sql-sandbox" props={{ exercise: task.sqlExercise, taskId: task.id }} />}
      {task.testExercise && <LazyWidget name="test-exercise" props={{ ex: task.testExercise, taskId: task.id }} />}
      {task.hints && task.hints.length > 0 && (
        <div class="hints">
          {task.hints.slice(0, hints).map((h, i) => <div class="hint" key={i}>💡 <Markdown text={h} inline /></div>)}
          {hints < task.hints.length && <button onClick={() => setHints(hints + 1)}>Подсказка {hints + 1} из {task.hints.length}</button>}
        </div>
      )}
      {task.check && (
        <ul class="selfcheck">{task.check.map((c, i) => <li key={i}>☐ <Markdown text={c} inline /></li>)}</ul>
      )}
      <label class="donebox">
        <input type="checkbox" checked={done} onChange={() => toggle('tasks', task.id)} /> Задача выполнена
      </label>
    </section>
  );
}
