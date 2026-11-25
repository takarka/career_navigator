import { describe, expect, it } from 'vitest';
import { orderSaga, runSaga, sagaTimeline, validateOrder, type SagaStep } from './saga.ts';
import { validateTimeline } from './timeline.ts';

describe('Saga', () => {
  it('без отказов все шаги выполнены, сага завершена', () => {
    const r = runSaga(orderSaga);
    expect(r.final).toBe('завершена');
    expect(Object.values(r.states).every((s) => s === 'выполнен')).toBe(true);
  });

  it('отказ на втором шаге компенсирует первый', () => {
    const r = runSaga(orderSaga, 1);
    expect(r.states).toMatchObject({ order: 'компенсирован', payment: 'отказ', stock: 'ожидает', delivery: 'ожидает' });
    expect(r.final).toBe('компенсирована');
  });

  it('компенсации идут в обратном порядке', () => {
    const r = runSaga(orderSaga, 3);
    const comps = r.history.filter((h) => h.kind === 'compensate').map((h) => h.step);
    expect(comps).toEqual(['stock', 'payment', 'order']);
    expect(r.final).toBe('компенсирована');
  });

  it('инвариант: при отказе любого шага никакой отменяемый выполненный шаг не остаётся без компенсации', () => {
    for (let k = 0; k < orderSaga.length; k++) {
      const r = runSaga(orderSaga, k);
      for (const s of orderSaga.slice(0, k)) expect(r.states[s.id], `fail=${k} step=${s.id}`).toBe('компенсирован');
    }
  });

  it('неотменяемый шаг в середине делает сагу застрявшей при последующем отказе', () => {
    const bad: SagaStep[] = [orderSaga[0], { id: 'sms', service: 'Уведомления', action: 'отправить SMS' }, orderSaga[1]];
    expect(validateOrder(bad)).toHaveLength(1);
    expect(runSaga(bad, 2).final).toBe('застряла');
    expect(validateOrder(orderSaga)).toEqual([]);
  });

  it('таймлайны для обоих стилей корректны при отказе на любом шаге', () => {
    for (const style of ['orchestration', 'choreography'] as const) for (const k of [undefined, 0, 1, 2, 3]) expect(validateTimeline(sagaTimeline(orderSaga, k, style)), `${style} ${k}`).toEqual([]);
  });
});
