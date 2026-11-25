import { useState } from 'preact/hooks';
import { toggle } from '../app/state.ts';

export interface MatchItem {
  label: string;
  answer: string;
  why: string;
}

/** Универсальная игра «разложи по категориям»: у каждого пункта выпадающий список вариантов, затем проверка с разбором. */
export function MatchGame({ items, options, taskId }: { items: MatchItem[]; options: string[]; taskId?: string }) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const all = items.every((_, i) => picked[i]);
  const right = items.filter((it, i) => picked[i] === it.answer).length;
  return (
    <div class="zones matchgame">
      <table>
        <thead><tr><th>Задача</th><th>Куда отнести</th></tr></thead>
        <tbody>
          {items.map((it, i) => {
            const ok = checked && picked[i] === it.answer;
            const bad = checked && picked[i] !== it.answer;
            return (
              <tr key={i} class={ok ? 'right' : bad ? 'wrong' : ''}>
                <td><label for={`match-${i}`}>{it.label}</label></td>
                <td>
                  <select id={`match-${i}`} value={picked[i] ?? ''} onChange={(e) => { setPicked({ ...picked, [i]: (e.target as HTMLSelectElement).value }); setChecked(false); }}>
                    <option value="">— выбери —</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {checked && <div class="muted small">{ok ? '✓ ' : `✗ Верно: ${it.answer}. `}{it.why}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="row">
        <button class="primary" disabled={!all} onClick={() => { setChecked(true); if (taskId && right === items.length) toggle('tasks', taskId, true); }}>Проверить</button>
        <button onClick={() => { setPicked({}); setChecked(false); }}>Сбросить</button>
      </div>
      <p aria-live="polite">{checked && (right === items.length ? 'Всё верно!' : `Верно: ${right} из ${items.length}.`)}</p>
    </div>
  );
}
