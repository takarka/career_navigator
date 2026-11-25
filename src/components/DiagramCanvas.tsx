import { useMemo, useState } from 'preact/hooks';
import { cascade, validateDiagram, type DiagramSpec, type Health, type NodeKind } from '../engine/diagram.ts';

const kindName: Record<NodeKind, string> = { client: 'клиент', service: 'сервис', db: 'БД', cache: 'кэш', queue: 'очередь' };
const color: Record<Health, string> = { ok: 'var(--ok)', degraded: 'var(--warn-border)', down: 'var(--bad)' };
const bg: Record<Health, string> = { ok: 'var(--ok-soft)', degraded: 'var(--warn-soft)', down: 'var(--bad-soft)' };
const label: Record<Health, string> = { ok: 'работает', degraded: 'деградация', down: 'не работает' };
const W = 720;
const NW = 120;
const NH = 52;

/** Холст схемы: клик по узлу «роняет» его, переключатель защиты показывает, как таймауты и circuit breaker останавливают каскад. */
export function DiagramCanvas({ spec, caption }: { spec: DiagramSpec; caption?: string }) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [prot, setProt] = useState<Set<string>>(() => new Set(spec.nodes.filter((n) => n.protected).map((n) => n.id)));
  const errs = validateDiagram(spec);
  const health = useMemo(() => cascade(spec, failed, prot), [spec, failed, prot]);
  if (errs.length) return <p class="callout warn">Ошибка схемы: {errs.join('; ')}</p>;
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const height = Math.max(...spec.nodes.map((n) => n.y)) + NH + 20;
  const flip = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (!n.delete(id)) n.add(id);
    return n;
  };

  return (
    <div class="diagram">
      <svg viewBox={`0 0 ${W} ${height}`} role="group" aria-label="Схема системы" style={{ width: '100%', height: 'auto' }}>
        <defs>
          <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {spec.edges.map((e) => {
          const a = byId.get(e.from)!;
          const b = byId.get(e.to)!;
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={a.x + NW / 2} y1={a.y + NH / 2} x2={b.x + NW / 2} y2={b.y + NH / 2} stroke="var(--muted)" stroke-width="1.6" stroke-dasharray={e.sync ? undefined : '6 4'} marker-end="url(#dg-arrow)" />
              {e.label && <text x={(a.x + b.x) / 2 + NW / 2 + 4} y={(a.y + b.y) / 2 + NH / 2 - 4} font-size="11" fill="var(--muted)">{e.label}</text>}
            </g>
          );
        })}
        {spec.nodes.map((n) => (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            aria-pressed={failed.has(n.id)}
            aria-label={`${n.label} ${kindName[n.kind]} · ${label[health[n.id]]}${prot.has(n.id) ? ' · защита' : ''}. Нажмите, чтобы ${failed.has(n.id) ? 'восстановить' : 'уронить'}`}
            style={{ cursor: 'pointer' }}
            onClick={() => setFailed(flip(failed, n.id))}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                setFailed(flip(failed, n.id));
              }
            }}
          >
            <rect x={n.x} y={n.y} width={NW} height={NH} rx="8" fill={bg[health[n.id]]} stroke={color[health[n.id]]} stroke-width={failed.has(n.id) ? 3 : 1.5} />
            <text x={n.x + 8} y={n.y + 22} font-size="14" fill="var(--text)">
              <tspan>{n.label}</tspan>{' '}
              <tspan x={n.x + 8} dy="18" font-size="11">{kindName[n.kind]} · {label[health[n.id]]}{prot.has(n.id) ? ' · защита' : ''}</tspan>
            </text>
          </g>
        ))}
      </svg>
      <p class="muted">Пунктир — асинхронная связь (через очередь), сплошная — синхронный вызов. Нажми на узел, чтобы уронить его.</p>
      <fieldset class="prot">
        <legend>Защита (таймаут + circuit breaker / fallback)</legend>
        {spec.nodes.filter((n) => n.kind === 'service').map((n) => (
          <label key={n.id}><input type="checkbox" checked={prot.has(n.id)} onChange={() => setProt(flip(prot, n.id))} /> {n.label}</label>
        ))}
      </fieldset>
      <button onClick={() => setFailed(new Set())} disabled={!failed.size}>Восстановить всё</button>
      {caption && <p class="model-note">{caption}</p>}
    </div>
  );
}
