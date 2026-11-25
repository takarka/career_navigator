import { setSelfAssessment, useProgress } from '../app/state.ts';
import { modules } from '../content/modules.ts';

const TOPICS = ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11', 'm12'];
const LABELS = ['не знаком', 'слышал', 'читал, но не применял', 'применял', 'могу объяснить и научить'];

/** Самооценка 0–4 по темам вакансии и радар-диаграмма. Оценки сохраняются и влияют на «слабые темы» мок-интервью. */
export function SelfAssess() {
  const progress = useProgress();
  const R = 110;
  const pts = TOPICS.map((t, i) => {
    const a = (i / TOPICS.length) * Math.PI * 2 - Math.PI / 2;
    const v = (progress.selfAssessment[t] ?? 0) / 4;
    return { t, a, x: 150 + Math.cos(a) * R * v, y: 150 + Math.sin(a) * R * v, lx: 150 + Math.cos(a) * (R + 22), ly: 150 + Math.sin(a) * (R + 22) };
  });
  const title = (id: string) => modules.find((m) => m.id === id)?.title ?? id;
  return (
    <div class="selfassess">
      <div class="grid2">
        <div>
          {TOPICS.map((t) => (
            <div key={t} class="field">
              <label for={`sa-${t}`}>{title(t)}: <b>{LABELS[progress.selfAssessment[t] ?? 0]}</b></label>
              <input id={`sa-${t}`} type="range" min={0} max={4} value={progress.selfAssessment[t] ?? 0} onInput={(e) => setSelfAssessment(t, Number((e.target as HTMLInputElement).value))} />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 300 300" role="img" aria-label="Радар самооценки по темам" style={{ width: '100%', maxWidth: '360px', height: 'auto' }}>
          {[0.25, 0.5, 0.75, 1].map((k) => <circle key={k} cx="150" cy="150" r={R * k} fill="none" stroke="var(--border)" />)}
          {pts.map((p) => <line key={p.t} x1="150" y1="150" x2={150 + Math.cos(p.a) * R} y2={150 + Math.sin(p.a) * R} stroke="var(--border)" />)}
          <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" />
          {pts.map((p) => <text key={p.t} x={p.lx} y={p.ly + 4} font-size="10" text-anchor="middle" fill="var(--text)">{p.t.slice(1)}</text>)}
        </svg>
      </div>
      <p class="muted small">Цифры на радаре — номера модулей. Оценки хранятся только в этом браузере.</p>
    </div>
  );
}
