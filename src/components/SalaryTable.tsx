import { useMemo } from 'preact/hooks';
import { update, useProgress } from '../app/state.ts';

interface Row {
  source: string;
  date: string;
  from: string;
  to: string;
}

const KEY = 'salary-table';
const empty = (): Row => ({ source: '', date: '', from: '', to: '' });

function load(raw: string | undefined): Row[] {
  try {
    const v = raw ? (JSON.parse(raw) as Row[]) : [];
    return Array.isArray(v) && v.length ? v : [empty(), empty(), empty()];
  } catch {
    return [empty(), empty(), empty()];
  }
}

const num = (s: string) => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && s.trim() !== '' ? n : null;
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Таблица для собственного исследования вилки. Цифры вводит пользователь, учебник их не подставляет. */
export function SalaryTable() {
  const progress = useProgress();
  const rows = useMemo(() => load(progress.sandboxDrafts[KEY]), [progress.sandboxDrafts[KEY]]);
  const save = (next: Row[]) =>
    update((p) => {
      p.sandboxDrafts[KEY] = JSON.stringify(next);
    });
  const set = (i: number, key: keyof Row, value: string) => save(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const froms = rows.map((r) => num(r.from)).filter((x): x is number => x !== null);
  const tos = rows.map((r) => num(r.to)).filter((x): x is number => x !== null);
  const filled = rows.filter((r) => r.source.trim() && (num(r.from) !== null || num(r.to) !== null)).length;

  return (
    <div class="salary">
      <p class="muted">Заполни по реальным источникам: вакансии, обзоры рынка, разговоры с коллегами. Валюта и период (месяц, до или после налогов) должны быть одинаковыми во всех строках.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Источник</th><th>Дата</th><th>От</th><th>До</th><th><span class="sr-only">Удалить строку</span></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input aria-label={`Источник, строка ${i + 1}`} value={r.source} onInput={(e) => set(i, 'source', (e.target as HTMLInputElement).value)} /></td>
                <td><input aria-label={`Дата, строка ${i + 1}`} value={r.date} placeholder="ГГГГ-ММ" onInput={(e) => set(i, 'date', (e.target as HTMLInputElement).value)} style={{ width: '7em' }} /></td>
                <td><input aria-label={`От, строка ${i + 1}`} inputMode="numeric" value={r.from} onInput={(e) => set(i, 'from', (e.target as HTMLInputElement).value)} style={{ width: '7em' }} /></td>
                <td><input aria-label={`До, строка ${i + 1}`} inputMode="numeric" value={r.to} onInput={(e) => set(i, 'to', (e.target as HTMLInputElement).value)} style={{ width: '7em' }} /></td>
                <td><button aria-label={`Удалить строку ${i + 1}`} onClick={() => save(rows.length > 1 ? rows.filter((_, j) => j !== i) : [empty()])}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="row">
        <button onClick={() => save([...rows, empty()])}>Добавить строку</button>
      </div>
      <p aria-live="polite">
        Источников с данными: <b>{filled}</b>{filled < 5 && ' (нужно минимум 5)'}.
        {froms.length > 0 && tos.length > 0 && <> Медиана нижней границы: <b>{median(froms)}</b>, верхней: <b>{median(tos)}</b>. Это ориентир для вилки, а не готовое число.</>}
      </p>
    </div>
  );
}
