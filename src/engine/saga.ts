import type { EventKind, TimelineSpec } from './timeline.ts';

/**
 * Saga: цепочка локальных транзакций с компенсациями.
 * При отказе шага k выполняются компенсации уже выполненных шагов в обратном порядке.
 * Шаг, который нельзя отменить (compensable = false), нужно ставить последним: после него отказов быть не должно.
 */
export interface SagaStep {
  id: string;
  service: string;
  action: string;
  /** Компенсирующее действие; undefined — шаг нельзя отменить. */
  compensation?: string;
}

export type StepState = 'ожидает' | 'выполнен' | 'отказ' | 'компенсирован' | 'не отменяется';

export interface SagaRun {
  states: Record<string, StepState>;
  final: 'завершена' | 'компенсирована' | 'застряла';
  /** Журнал в порядке выполнения. */
  history: { step: string; kind: 'action' | 'fail' | 'compensate' | 'stuck'; text: string }[];
}

export const orderSaga: SagaStep[] = [
  { id: 'order', service: 'Заказы', action: 'создать заказ', compensation: 'отменить заказ' },
  { id: 'payment', service: 'Платежи', action: 'списать оплату', compensation: 'вернуть деньги' },
  { id: 'stock', service: 'Склад', action: 'зарезервировать товар', compensation: 'снять резерв' },
  { id: 'delivery', service: 'Доставка', action: 'назначить курьера' },
];

/** failAt — индекс шага, на котором происходит отказ (или undefined — без отказов). */
export function runSaga(steps: SagaStep[], failAt?: number): SagaRun {
  const states: Record<string, StepState> = Object.fromEntries(steps.map((s) => [s.id, 'ожидает' as StepState]));
  const history: SagaRun['history'] = [];
  let failed = false;
  let idx = 0;
  for (; idx < steps.length; idx++) {
    const s = steps[idx];
    if (idx === failAt) {
      states[s.id] = 'отказ';
      history.push({ step: s.id, kind: 'fail', text: `${s.service}: «${s.action}» не удалось` });
      failed = true;
      break;
    }
    states[s.id] = 'выполнен';
    history.push({ step: s.id, kind: 'action', text: `${s.service}: ${s.action}` });
  }
  if (!failed) return { states, final: 'завершена', history };

  let stuck = false;
  for (let i = idx - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.compensation) {
      states[s.id] = 'компенсирован';
      history.push({ step: s.id, kind: 'compensate', text: `${s.service}: ${s.compensation}` });
    } else {
      states[s.id] = 'не отменяется';
      history.push({ step: s.id, kind: 'stuck', text: `${s.service}: «${s.action}» отменить нельзя` });
      stuck = true;
    }
  }
  return { states, final: stuck ? 'застряла' : 'компенсирована', history };
}

/** Проверка порядка: неотменяемые шаги должны стоять в конце (после них нет отменяемых). */
export function validateOrder(steps: SagaStep[]): string[] {
  const errs: string[] = [];
  const firstIrreversible = steps.findIndex((s) => !s.compensation);
  if (firstIrreversible >= 0 && steps.slice(firstIrreversible + 1).some((s) => s.compensation)) errs.push('после неотменяемого шага есть отменяемые: неотменяемые шаги нужно ставить последними');
  return errs;
}

export type Style = 'orchestration' | 'choreography';

export function sagaTimeline(steps: SagaStep[], failAt: number | undefined, style: Style): TimelineSpec {
  const lanes = [{ id: 'coord', title: style === 'orchestration' ? 'Оркестратор' : 'Шина событий' }, ...steps.map((s) => ({ id: s.id, title: s.service }))];
  const run = runSaga(steps, failAt);
  const events: TimelineSpec['events'] = [];
  const stepsOut: TimelineSpec['steps'] = [];
  const arrows: NonNullable<TimelineSpec['arrows']> = [];
  let t = 0;
  const add = (lane: string, label: string, kind: EventKind, title: string, text: string) => {
    const id = `e${events.length}`;
    events.push({ id, lane, at: t++, label, kind, step: stepsOut.length });
    stepsOut.push({ title, text });
    return id;
  };
  let prev: string | undefined;
  for (const h of run.history) {
    const s = steps.find((x) => x.id === h.step)!;
    const cmd = style === 'orchestration' ? 'команда' : 'событие';
    const trigger = h.kind === 'compensate' ? `${cmd}: компенсация ${s.id}` : `${cmd}: ${s.id}`;
    const a = add('coord', trigger, h.kind === 'compensate' ? 'wait' : 'info', style === 'orchestration' ? 'Оркестратор посылает команду' : 'Событие в шине', h.text);
    if (prev) arrows.push({ from: prev, to: a });
    const kind: EventKind = h.kind === 'action' ? 'ok' : h.kind === 'compensate' ? 'wait' : 'bad';
    const label = h.kind === 'action' ? s.action : h.kind === 'compensate' ? s.compensation! : h.kind === 'fail' ? 'отказ' : 'не отменить';
    const e = add(s.id, label, kind, h.kind === 'action' ? 'Шаг выполнен' : h.kind === 'compensate' ? 'Компенсация' : h.kind === 'fail' ? 'Отказ шага' : 'Застряли', h.text);
    arrows.push({ from: a, to: e });
    prev = e;
  }
  return { lanes, events, arrows, steps: stepsOut };
}
