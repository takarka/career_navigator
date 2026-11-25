/**
 * Разбор CPU-профиля V8 (.cpuprofile из `node --cpu-prof` или Chrome DevTools): дерево вызовов, самое «горячее»,
 * раскладка для flame graph. Проверяется на реальном профиле, снятом настоящим Node (cpuprofile.test.ts).
 */
export interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
}
export interface ProfileNode {
  id: number;
  callFrame: CallFrame;
  children?: number[];
}
export interface CpuProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface TreeNode {
  name: string;
  url: string;
  line: number;
  /** Собственное время, мкс. */
  self: number;
  /** Время с учётом вызванных функций, мкс. */
  total: number;
  children: TreeNode[];
}

const label = (cf: CallFrame) => cf.functionName || (cf.url ? '(anonymous)' : '(root)');

export function buildTree(p: CpuProfile): TreeNode {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const selfById = new Map<number, number>();
  // время сэмпла i = интервал до следующего сэмпла
  p.samples.forEach((id, i) => selfById.set(id, (selfById.get(id) ?? 0) + (p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0)));
  const make = (id: number): TreeNode => {
    const n = byId.get(id)!;
    const children = (n.children ?? []).map(make);
    const self = selfById.get(id) ?? 0;
    return { name: label(n.callFrame), url: n.callFrame.url, line: n.callFrame.lineNumber + 1, self, total: self + children.reduce((s, c) => s + c.total, 0), children };
  };
  return make(p.nodes[0].id);
}

export interface Hot {
  name: string;
  url: string;
  line: number;
  self: number;
  /** Доля от общего времени, 0..1. */
  share: number;
}

/** Самые «горячие» функции по собственному времени (рекурсивные вызовы суммируются). */
export function hottest(root: TreeNode, top = 10): Hot[] {
  const agg = new Map<string, Hot>();
  const walk = (n: TreeNode) => {
    const key = `${n.name}|${n.url}|${n.line}`;
    const h = agg.get(key) ?? { name: n.name, url: n.url, line: n.line, self: 0, share: 0 };
    h.self += n.self;
    agg.set(key, h);
    n.children.forEach(walk);
  };
  walk(root);
  const total = root.total || 1;
  return [...agg.values()]
    .map((h) => ({ ...h, share: h.self / total }))
    .sort((a, b) => b.self - a.self)
    .slice(0, top);
}

export interface Rect {
  x: number;
  w: number;
  depth: number;
  name: string;
  total: number;
  self: number;
  url: string;
  line: number;
}

/** Раскладка flame graph: ширина прямоугольника пропорциональна total времени, дети — внутри родителя. */
export function flameRects(root: TreeNode, minShare = 0.002): Rect[] {
  const out: Rect[] = [];
  const total = root.total || 1;
  const go = (n: TreeNode, x: number, depth: number) => {
    const w = n.total / total;
    if (w < minShare) return;
    out.push({ x, w, depth, name: n.name, total: n.total, self: n.self, url: n.url, line: n.line });
    let cx = x;
    for (const c of [...n.children].sort((a, b) => b.total - a.total)) {
      go(c, cx, depth + 1);
      cx += c.total / total;
    }
  };
  go(root, 0, 0);
  return out;
}
