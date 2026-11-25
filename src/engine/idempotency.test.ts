import { describe, expect, it } from 'vitest';
import { applyStream, demoStream, expectedBalance } from './idempotency.ts';
import { backoffSchedule, decide } from './retry.ts';

describe('идемпотентность', () => {
  const expected = expectedBalance(demoStream);
  it('ожидаемый итог: 10 + 5 − 3 = 12', () => expect(expected).toBe(12));
  it('naive: дубли удваивают эффект', () => expect(applyStream('naive', demoStream).balance).toBe(10 + 5 + 10 - 3 + 5));
  it('set-value: старый дубль откатывает состояние', () => {
    const r = applyStream('set-value', demoStream);
    expect(r.balance).not.toBe(expected); // последний дубль m2 перезаписал значение m3
    expect(r.balance).toBe(15);
  });
  it('dedup-table (в одной транзакции) даёт верный итог', () => {
    const r = applyStream('dedup-table', demoStream);
    expect(r.balance).toBe(expected);
    expect(r.skipped).toEqual(['m1', 'm2']);
  });
  it('dedup без атомарности теряет эффект при сбое между записью в таблицу и эффектом', () => {
    expect(applyStream('dedup-not-atomic', demoStream, 'm2').balance).not.toBe(expected);
    expect(applyStream('dedup-not-atomic', demoStream).balance).toBe(expected);
  });
});

describe('расписание повторов', () => {
  const plan = { base: 1000, factor: 2, max: 10000, attempts: 6, jitter: 'none' as const, seed: 1 };
  it('экспоненциальный рост с потолком', () => expect(backoffSchedule(plan)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]));
  it('full jitter укладывается в [0, delay]', () => {
    const s = backoffSchedule({ ...plan, jitter: 'full' });
    const upper = backoffSchedule(plan);
    s.forEach((v, i) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(upper[i]); });
  });
  it('equal jitter укладывается в [delay/2, delay]', () => {
    const s = backoffSchedule({ ...plan, jitter: 'equal' });
    const upper = backoffSchedule(plan);
    s.forEach((v, i) => { expect(v).toBeGreaterThanOrEqual(upper[i] / 2 - 1); expect(v).toBeLessThanOrEqual(upper[i]); });
  });
  it('расписание воспроизводимо при одинаковом seed', () => expect(backoffSchedule({ ...plan, jitter: 'full' })).toEqual(backoffSchedule({ ...plan, jitter: 'full' })));
  it('решение: постоянная ошибка — сразу в DLQ; временная — повтор до лимита', () => {
    expect(decide('permanent', 0, 5)).toBe('dlq');
    expect(decide('transient', 0, 5)).toBe('retry');
    expect(decide('transient', 4, 5)).toBe('dlq');
  });
});
