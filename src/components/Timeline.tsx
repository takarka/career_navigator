import { useState } from 'preact/hooks';
import { layoutTimeline, validateTimeline, type EventKind, type TimelineSpec } from '../engine/timeline.ts';
import { SimPlayer } from './SimPlayer.tsx';

const W = 720;
const LANE_H = 56;
const fill: Record<EventKind, string> = {
  ok: 'var(--ok-soft)',
  bad: 'var(--bad-soft)',
  wait: 'var(--warn-soft)',
  info: 'var(--accent-soft)',
};
const stroke: Record<EventKind, string> = { ok: 'var(--ok)', bad: 'var(--bad)', wait: 'var(--warn-border)', info: 'var(--accent)' };

/** Таймлайн с дорожками, событиями и стрелками; шаги управляются SimPlayer. */
export function Timeline({ spec, id = 'timeline' }: { spec: TimelineSpec; id?: string }) {
  const [step, setStep] = useState(0);
  const errs = validateTimeline(spec);
  if (errs.length) return <p class="callout warn">Ошибка спецификации таймлайна: {errs.join('; ')}</p>;
  const { placed, height } = layoutTimeline(spec, W, LANE_H);
  const byId = new Map(placed.map((p) => [p.id, p]));
  const current = spec.steps[step];

  return (
    <div class="timeline">
      <SimPlayer total={spec.steps.length} index={step} setIndex={setStep} resetKey={id} />
      <svg viewBox={`0 0 ${W} ${height + 8}`} role="img" aria-label={`Диаграмма времени: ${spec.lanes.map((l) => l.title).join(', ')}`} style={{ width: '100%', height: 'auto' }}>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {spec.lanes.map((l, i) => (
          <g key={l.id}>
            <rect x="0" y={i * LANE_H} width={W} height={LANE_H} fill={i % 2 ? 'transparent' : 'var(--surface-2)'} opacity="0.6" />
            <text x="8" y={i * LANE_H + LANE_H / 2 + 4} font-size="13" font-weight="700" fill="var(--text)">{l.title}</text>
          </g>
        ))}
        {(spec.arrows ?? []).map((a) => {
          const f = byId.get(a.from)!;
          const t = byId.get(a.to)!;
          if (f.step > step || t.step > step) return null;
          const x1 = f.x + f.w / 2;
          const y1 = f.y + LANE_H / 2 + (t.y > f.y ? 14 : -14);
          const x2 = t.x + t.w / 2;
          const y2 = t.y + LANE_H / 2 + (t.y > f.y ? -14 : 14);
          return (
            <g key={`${a.from}-${a.to}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted)" stroke-width="1.5" marker-end={`url(#${id}-arrow)`} />
              {a.label && <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2} font-size="11" fill="var(--muted)">{a.label}</text>}
            </g>
          );
        })}
        {placed.filter((p) => p.step <= step).map((p) => {
          const k = p.kind ?? 'info';
          const now = p.step === step;
          return (
            <g key={p.id}>
              <rect x={p.x} y={p.y + 10} width={p.w} height={LANE_H - 20} rx="6" fill={fill[k]} stroke={stroke[k]} stroke-width={now ? 3 : 1.2} />
              <text x={p.x + p.w / 2} y={p.y + LANE_H / 2 + 4} text-anchor="middle" font-size="12" fill="var(--text)">{p.label}</text>
            </g>
          );
        })}
      </svg>
      <div class="sim-step" aria-live="polite">
        <b>Шаг {step + 1} из {spec.steps.length}. {current.title}</b>
        <div>{current.text}</div>
      </div>
    </div>
  );
}
