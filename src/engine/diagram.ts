/** Модель архитектурной схемы с инъекцией отказов (каскад по синхронным связям). */
export type NodeKind = 'client' | 'service' | 'db' | 'cache' | 'queue';
export type Health = 'ok' | 'degraded' | 'down';

export interface DNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  /** Защита от каскада: таймаут + circuit breaker или fallback. Вместо падения узел деградирует. */
  protected?: boolean;
}

export interface DEdge {
  from: string;
  to: string;
  /** true — синхронный вызов (отказ зависимости влияет на вызывающего), false — через очередь. */
  sync: boolean;
  label?: string;
}

export interface DiagramSpec {
  nodes: DNode[];
  edges: DEdge[];
}

export function validateDiagram(spec: DiagramSpec): string[] {
  const errs: string[] = [];
  const ids = new Set(spec.nodes.map((n) => n.id));
  if (ids.size !== spec.nodes.length) errs.push('повторяющиеся id узлов');
  for (const e of spec.edges) {
    if (!ids.has(e.from)) errs.push(`связь: нет узла ${e.from}`);
    if (!ids.has(e.to)) errs.push(`связь: нет узла ${e.to}`);
  }
  return errs;
}

/**
 * Здоровье каждого узла при заданных отказах.
 * Отказавший узел — down. Для узла с синхронными зависимостями:
 *  - есть зависимость в down: защищённый узел (таймаут + circuit breaker / fallback) → degraded, иначе → down;
 *  - иначе есть зависимость в degraded → degraded (ответ урезан, но приходит).
 * Асинхронные связи (через очередь) отказ не передают: сообщения копятся.
 * Расчёт идёт до неподвижной точки, поэтому порядок узлов не важен и циклы безопасны
 * (состояние только ухудшается: ok → degraded → down).
 */
export function cascade(spec: DiagramSpec, failed: Set<string>, protectedOverride?: Set<string>): Record<string, Health> {
  const rank: Record<Health, number> = { ok: 0, degraded: 1, down: 2 };
  const health: Record<string, Health> = {};
  for (const n of spec.nodes) health[n.id] = failed.has(n.id) ? 'down' : 'ok';
  const isProtected = (n: DNode) => (protectedOverride ? protectedOverride.has(n.id) : !!n.protected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of spec.nodes) {
      const deps = spec.edges.filter((e) => e.from === n.id && e.sync).map((e) => health[e.to]);
      let next: Health = 'ok';
      if (deps.includes('down')) next = isProtected(n) ? 'degraded' : 'down';
      else if (deps.includes('degraded')) next = 'degraded';
      if (rank[next] > rank[health[n.id]]) {
        health[n.id] = next;
        changed = true;
      }
    }
  }
  return health;
}
