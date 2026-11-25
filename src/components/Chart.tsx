import { formatNum, niceTicks, scaleLinear } from '../engine/chart.ts';

export interface Series {
  name: string;
  /** Значения по оси Y; для line — точки [x, y]. */
  points: [number, number][];
}

interface Props {
  kind?: 'line' | 'bar';
  series: Series[];
  xLabel?: string;
  yLabel?: string;
  title: string;
  /** Подписи категорий для bar (по индексу x). */
  categories?: string[];
  height?: number;
}

const COLORS = ['var(--poll)', 'var(--check)', 'var(--timers)', 'var(--micro)'];
const W = 640;
const M = { l: 52, r: 16, t: 14, b: 44 };

/** Лёгкий SVG-график без внешних библиотек. Доступен: role="img" и таблица данных в details. */
export function Chart({ kind = 'line', series, xLabel, yLabel, title, categories, height = 260 }: Props) {
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const y = niceTicks(Math.min(0, ...ys), Math.max(...ys, 1), 5);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const sx = kind === 'bar' ? scaleLinear(-0.5, (categories?.length ?? xmax + 1) - 0.5, M.l, W - M.r) : scaleLinear(xmin, xmax, M.l, W - M.r);
  const sy = scaleLinear(y.min, y.max, height - M.b, M.t);
  const xt = kind === 'line' ? niceTicks(xmin, xmax, 6).ticks.filter((t) => t >= xmin && t <= xmax) : [];
  const barW = kind === 'bar' ? ((W - M.l - M.r) / Math.max(1, categories?.length ?? xmax + 1) / Math.max(1, series.length)) * 0.8 : 0;

  return (
    <figure class="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto' }}>
        {y.ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" />
            <text x={M.l - 6} y={sy(t) + 4} text-anchor="end" font-size="11" fill="var(--muted)">{formatNum(t)}</text>
          </g>
        ))}
        {kind === 'line' && xt.map((t) => <text key={t} x={sx(t)} y={height - M.b + 16} text-anchor="middle" font-size="11" fill="var(--muted)">{formatNum(t)}</text>)}
        {kind === 'bar' && (categories ?? []).map((c, i) => <text key={c} x={sx(i)} y={height - M.b + 16} text-anchor="middle" font-size="11" fill="var(--muted)">{c}</text>)}
        {kind === 'line' &&
          series.map((s, i) => (
            <polyline key={s.name} fill="none" stroke={COLORS[i % COLORS.length]} stroke-width="2.5" points={s.points.map(([px, py]) => `${sx(px)},${sy(py)}`).join(' ')} />
          ))}
        {kind === 'bar' &&
          series.map((s, i) =>
            s.points.map(([px, py]) => (
              <rect key={`${s.name}-${px}`} x={sx(px) - (barW * series.length) / 2 + i * barW} y={sy(Math.max(py, 0))} width={barW} height={Math.abs(sy(0) - sy(py))} fill={COLORS[i % COLORS.length]} rx="2" />
            )),
          )}
        <line x1={M.l} x2={M.l} y1={M.t} y2={height - M.b} stroke="var(--muted)" />
        <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} stroke="var(--muted)" />
        {xLabel && <text x={(M.l + W - M.r) / 2} y={height - 6} text-anchor="middle" font-size="12" fill="var(--text)">{xLabel}</text>}
        {yLabel && <text x={12} y={(M.t + height - M.b) / 2} text-anchor="middle" font-size="12" fill="var(--text)" transform={`rotate(-90 12 ${(M.t + height - M.b) / 2})`}>{yLabel}</text>}
      </svg>
      <div class="legend">
        {series.map((s, i) => <span key={s.name} class="legend-item"><i style={{ background: COLORS[i % COLORS.length] }} /> {s.name}</span>)}
      </div>
      <details class="chart-data">
        <summary>Таблица данных</summary>
        <table>
          <thead><tr><th>x</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
          <tbody>
            {Array.from(new Set(xs)).sort((a, b) => a - b).map((x) => (
              <tr key={x}><td>{kind === 'bar' ? categories?.[x] ?? x : formatNum(x)}</td>{series.map((s) => <td key={s.name}>{formatNum(s.points.find((p) => p[0] === x)?.[1] ?? NaN)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
