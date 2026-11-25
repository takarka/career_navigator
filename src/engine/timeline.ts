/** Модель общего таймлайна: дорожки (сессии БД, сервисы), события, стрелки, пошаговое раскрытие. */
export type EventKind = 'ok' | 'bad' | 'wait' | 'info';

export interface TLLane {
  id: string;
  title: string;
}

export interface TLEvent {
  id: string;
  lane: string;
  /** Момент начала (условные единицы времени). */
  at: number;
  dur?: number;
  label: string;
  kind?: EventKind;
  /** Номер шага, на котором событие появляется. */
  step: number;
}

export interface TLArrow {
  from: string;
  to: string;
  label?: string;
}

export interface TLStep {
  title: string;
  text: string;
}

export interface TimelineSpec {
  lanes: TLLane[];
  events: TLEvent[];
  arrows?: TLArrow[];
  steps: TLStep[];
}

export function validateTimeline(spec: TimelineSpec): string[] {
  const errs: string[] = [];
  const lanes = new Set(spec.lanes.map((l) => l.id));
  if (lanes.size !== spec.lanes.length) errs.push('повторяющиеся id дорожек');
  const ids = new Set<string>();
  for (const e of spec.events) {
    if (ids.has(e.id)) errs.push(`повторяющийся id события ${e.id}`);
    ids.add(e.id);
    if (!lanes.has(e.lane)) errs.push(`событие ${e.id}: неизвестная дорожка ${e.lane}`);
    if (e.step < 0 || e.step >= spec.steps.length) errs.push(`событие ${e.id}: шаг ${e.step} вне диапазона`);
    if ((e.dur ?? 0) < 0) errs.push(`событие ${e.id}: отрицательная длительность`);
  }
  for (const a of spec.arrows ?? []) {
    if (!ids.has(a.from)) errs.push(`стрелка: нет события ${a.from}`);
    if (!ids.has(a.to)) errs.push(`стрелка: нет события ${a.to}`);
  }
  return errs;
}

export interface Placed extends TLEvent {
  x: number;
  w: number;
  y: number;
}

/** Раскладка событий по координатам SVG. */
export function layoutTimeline(spec: TimelineSpec, width: number, laneHeight: number, left = 110, right = 16, minBox = 70) {
  const tmin = Math.min(...spec.events.map((e) => e.at));
  const tmax = Math.max(...spec.events.map((e) => e.at + (e.dur ?? 0)));
  const span = tmax - tmin || 1;
  const inner = width - left - right - minBox;
  const laneIndex = new Map(spec.lanes.map((l, i) => [l.id, i]));
  const placed: Placed[] = spec.events.map((e) => ({
    ...e,
    x: left + ((e.at - tmin) / span) * inner,
    w: Math.max(minBox, ((e.dur ?? 0) / span) * inner),
    y: (laneIndex.get(e.lane) ?? 0) * laneHeight,
  }));
  return { placed, height: spec.lanes.length * laneHeight };
}
