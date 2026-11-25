import { useState } from 'preact/hooks';
import { zoneItems, zoneLabel, type Zone } from '../content/m01/zones.ts';
import { toggle } from '../app/state.ts';

const zones: Zone[] = ['main', 'pool', 'os'];

/** «Куда пойдёт операция»: каждой операции выбери зону выполнения, затем проверь. */
export function ZonesGame({ taskId }: { taskId?: string }) {
  const [picked, setPicked] = useState<Record<string, Zone | ''>>({});
  const [checked, setChecked] = useState(false);
  const allPicked = zoneItems.every((i) => picked[i.id]);
  const correct = zoneItems.filter((i) => picked[i.id] === i.zone).length;

  const check = () => {
    setChecked(true);
    if (taskId && correct === zoneItems.length) toggle('tasks', taskId, true);
  };

  return (
    <div class="zones">
      <table>
        <thead>
          <tr><th>Операция</th><th>Где выполняется</th></tr>
        </thead>
        <tbody>
          {zoneItems.map((it) => {
            const ok = checked && picked[it.id] === it.zone;
            const bad = checked && picked[it.id] !== it.zone;
            return (
              <tr key={it.id} class={ok ? 'right' : bad ? 'wrong' : ''}>
                <td><label for={`zone-${it.id}`}><code>{it.label}</code></label></td>
                <td>
                  <select id={`zone-${it.id}`} value={picked[it.id] ?? ''} onChange={(e) => { setPicked({ ...picked, [it.id]: (e.target as HTMLSelectElement).value as Zone }); setChecked(false); }}>
                    <option value="">— выбери —</option>
                    {zones.map((z) => <option key={z} value={z}>{zoneLabel[z]}</option>)}
                  </select>
                  {checked && <div class="muted small">{ok ? '✓ ' : `✗ Верно: ${zoneLabel[it.zone]}. `}{it.why}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="row">
        <button class="primary" onClick={check} disabled={!allPicked}>Проверить</button>
        <button onClick={() => { setPicked({}); setChecked(false); }}>Сбросить</button>
      </div>
      <p aria-live="polite">{checked && (correct === zoneItems.length ? 'Всё верно!' : `Верно: ${correct} из ${zoneItems.length}. Разбор показан у каждой операции.`)}</p>
    </div>
  );
}
