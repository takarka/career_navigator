import { describe, expect, it } from 'vitest';
import { layoutTimeline, validateTimeline, type TimelineSpec } from './timeline.ts';

const spec: TimelineSpec = {
  lanes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
  events: [
    { id: 'e1', lane: 'a', at: 0, dur: 10, label: 'BEGIN', step: 0 },
    { id: 'e2', lane: 'b', at: 10, label: 'UPDATE', kind: 'wait', step: 1 },
  ],
  arrows: [{ from: 'e1', to: 'e2', label: 'блокирует' }],
  steps: [{ title: '1', text: 'a' }, { title: '2', text: 'b' }],
};

describe('timeline', () => {
  it('корректная спецификация без ошибок', () => expect(validateTimeline(spec)).toEqual([]));
  it('находит неизвестные дорожки, шаги и стрелки', () => {
    const bad: TimelineSpec = { ...spec, events: [{ id: 'x', lane: 'zz', at: 0, label: '', step: 5 }], arrows: [{ from: 'x', to: 'nope' }] };
    const errs = validateTimeline(bad);
    expect(errs.some((e) => e.includes('неизвестная дорожка'))).toBe(true);
    expect(errs.some((e) => e.includes('вне диапазона'))).toBe(true);
    expect(errs.some((e) => e.includes('нет события nope'))).toBe(true);
  });
  it('раскладка: время слева направо, дорожки сверху вниз', () => {
    const { placed, height } = layoutTimeline(spec, 600, 50);
    expect(placed[0].x).toBeLessThan(placed[1].x);
    expect(placed[1].y).toBe(50);
    expect(height).toBe(100);
    expect(placed[1].x + placed[1].w).toBeLessThanOrEqual(600);
  });
});
