/** Чистые функции для графиков: шкалы, «красивые» деления, гистограммы, перцентили. */

export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Деления оси: границы округляются до шага. */
export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; min: number; max: number } {
  if (min === max) {
    const d = Math.abs(min) || 1;
    min -= d / 2;
    max += d / 2;
  }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, min: lo, max: hi };
}

export function scaleLinear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Перцентиль методом ближайшего ранга. p в диапазоне 0..100. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Гистограмма с равными корзинами; максимум попадает в последнюю корзину. */
export function histogram(values: number[], bins: number): Bin[] {
  if (!values.length || bins < 1) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) out[Math.min(bins - 1, Math.floor((v - min) / width))].count++;
  return out;
}

export function formatNum(v: number): string {
  if (Math.abs(v) >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${+v.toFixed(2)}`;
}
