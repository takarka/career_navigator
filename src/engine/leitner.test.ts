import { describe, expect, it } from 'vitest';
import { addDays, boxCounts, dueCards, INTERVALS, review } from './leitner.ts';

describe('Лейтнер', () => {
  it('интервалы 1, 2, 4, 8, 16', () => expect([...INTERVALS]).toEqual([1, 2, 4, 8, 16]));

  it('addDays переходит через границу месяца и года', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('верный ответ поднимает коробку и ставит срок по интервалу', () => {
    const a = review(undefined, true, '2026-11-25');
    expect(a).toEqual({ box: 1, due: '2026-11-26' });
    const b = review(a, true, '2026-11-26');
    expect(b).toEqual({ box: 2, due: '2026-11-28' });
    const c = review({ box: 5, due: '2026-11-25' }, true, '2026-11-25');
    expect(c).toEqual({ box: 5, due: '2026-12-11' });
  });

  it('неверный ответ возвращает в первую коробку', () => {
    expect(review({ box: 4, due: '2026-11-25' }, false, '2026-11-25')).toEqual({ box: 1, due: '2026-11-26' });
  });

  it('dueCards: просроченные по порядку, затем новые с лимитом', () => {
    const state = { a: { box: 2, due: '2026-11-20' }, b: { box: 1, due: '2026-11-24' }, c: { box: 3, due: '2026-12-01' } };
    expect(dueCards(['a', 'b', 'c', 'n1', 'n2', 'n3'], state, '2026-11-25', 2)).toEqual(['a', 'b', 'n1', 'n2']);
  });

  it('boxCounts', () => {
    expect(boxCounts(['a', 'b', 'x'], { a: { box: 1, due: '' }, b: { box: 1, due: '' } })).toEqual([2, 0, 0, 0, 0]);
  });
});
