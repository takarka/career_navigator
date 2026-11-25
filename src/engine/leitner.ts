/** Коробки Лейтнера: 5 коробок, интервалы повторения 1, 2, 4, 8, 16 дней. */
export const INTERVALS = [1, 2, 4, 8, 16] as const;

export interface CardState {
  /** Номер коробки 1..5. */
  box: number;
  /** Дата следующего повторения, YYYY-MM-DD. */
  due: string;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** Результат ответа: верно — карточка переходит в следующую коробку, неверно — возвращается в первую. */
export function review(prev: CardState | undefined, correct: boolean, today: string): CardState {
  const box = correct ? Math.min(INTERVALS.length, (prev?.box ?? 0) + 1) : 1;
  return { box, due: addDays(today, INTERVALS[box - 1]) };
}

/** Карточки к повторению: новые (без состояния) и те, чей срок наступил. Сначала просроченные и низкие коробки. */
export function dueCards(ids: string[], state: Record<string, CardState>, today: string, limitNew = 10): string[] {
  const due = ids.filter((id) => state[id] && state[id].due <= today).sort((a, b) => state[a].due.localeCompare(state[b].due) || state[a].box - state[b].box);
  const fresh = ids.filter((id) => !state[id]).slice(0, limitNew);
  return [...due, ...fresh];
}

export function boxCounts(ids: string[], state: Record<string, CardState>): number[] {
  const counts = new Array(INTERVALS.length).fill(0) as number[];
  for (const id of ids) if (state[id]) counts[state[id].box - 1]++;
  return counts;
}
