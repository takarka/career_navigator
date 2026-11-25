import { describe, expect, it } from 'vitest';
import { formatNum, histogram, niceTicks, percentile, scaleLinear } from './chart.ts';

describe('chart', () => {
  it('niceTicks округляет границы до шага', () => {
    const t = niceTicks(3, 97, 5);
    expect(t.min).toBeLessThanOrEqual(3);
    expect(t.max).toBeGreaterThanOrEqual(97);
    expect(t.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('niceTicks работает для одинаковых min и max', () => {
    const t = niceTicks(5, 5);
    expect(t.min).toBeLessThan(5);
    expect(t.max).toBeGreaterThan(5);
  });
  it('scaleLinear', () => {
    const s = scaleLinear(0, 10, 100, 200);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(150);
    expect(scaleLinear(3, 3, 0, 10)(3)).toBe(0);
  });
  it('percentile (ближайший ранг)', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([], 50)).toBeNaN();
  });
  it('histogram считает все значения', () => {
    const h = histogram([1, 2, 2, 3, 10], 3);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(h[2].count).toBe(1);
  });
  it('formatNum', () => {
    expect(formatNum(1500)).toBe('1.5k');
    expect(formatNum(0.125)).toBe('0.13');
  });
});
