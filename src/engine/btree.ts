/**
 * Модель B-tree (вариант B+-дерева для наглядности): вставка с делением узлов, поиск с путём.
 * maxKeys — максимум ключей в узле. Листья хранят ключи, внутренние узлы — разделители.
 * Это учебная модель: не отражает страницы PostgreSQL (8 КБ), но показывает, почему поиск идёт за O(log n) шагов.
 */
export interface BNode {
  id: number;
  leaf: boolean;
  keys: number[];
  children: BNode[];
}

export interface BTree {
  root: BNode;
  maxKeys: number;
  nextId: number;
  /** Сколько раз делились узлы при последней вставке. */
  lastSplits: number;
}

export function createTree(maxKeys = 3): BTree {
  return { root: { id: 1, leaf: true, keys: [], children: [] }, maxKeys, nextId: 2, lastSplits: 0 };
}

const cloneNode = (n: BNode): BNode => ({ ...n, keys: [...n.keys], children: n.children.map(cloneNode) });

export function insert(t0: BTree, key: number): BTree {
  const t: BTree = { ...t0, root: cloneNode(t0.root), lastSplits: 0 };
  const split = (node: BNode): { sep: number; right: BNode } => {
    t.lastSplits++;
    const mid = Math.floor(node.keys.length / 2);
    if (node.leaf) {
      const right: BNode = { id: t.nextId++, leaf: true, keys: node.keys.slice(mid), children: [] };
      node.keys = node.keys.slice(0, mid);
      return { sep: right.keys[0], right };
    }
    const sep = node.keys[mid];
    const right: BNode = { id: t.nextId++, leaf: false, keys: node.keys.slice(mid + 1), children: node.children.slice(mid + 1) };
    node.keys = node.keys.slice(0, mid);
    node.children = node.children.slice(0, mid + 1);
    return { sep, right };
  };
  const go = (node: BNode): { sep: number; right: BNode } | null => {
    if (node.leaf) {
      if (node.keys.includes(key)) return null;
      node.keys.push(key);
      node.keys.sort((a, b) => a - b);
    } else {
      let i = node.keys.findIndex((k) => key < k);
      if (i < 0) i = node.keys.length;
      const res = go(node.children[i]);
      if (res) {
        node.keys.splice(i, 0, res.sep);
        node.children.splice(i + 1, 0, res.right);
      }
    }
    return node.keys.length > t.maxKeys ? split(node) : null;
  };
  const res = go(t.root);
  if (res) t.root = { id: t.nextId++, leaf: false, keys: [res.sep], children: [t.root, res.right] };
  return t;
}

/** Поиск: возвращает путь узлов (id) от корня до листа и найден ли ключ. */
export function search(t: BTree, key: number): { path: number[]; found: boolean } {
  const path: number[] = [];
  let n = t.root;
  for (;;) {
    path.push(n.id);
    if (n.leaf) return { path, found: n.keys.includes(key) };
    let i = n.keys.findIndex((k) => key < k);
    if (i < 0) i = n.keys.length;
    n = n.children[i];
  }
}

export function height(t: BTree): number {
  let h = 1;
  for (let n = t.root; !n.leaf; n = n.children[0]) h++;
  return h;
}

export function inOrder(t: BTree): number[] {
  const out: number[] = [];
  const go = (n: BNode) => (n.leaf ? out.push(...n.keys) : n.children.forEach(go));
  go(t.root);
  return out;
}

/** Проверка инвариантов: порядок ключей, одинаковая глубина листьев, лимит ключей, число детей. */
export function validate(t: BTree): string[] {
  const errs: string[] = [];
  const depths = new Set<number>();
  const go = (n: BNode, d: number, lo: number, hi: number) => {
    if (n.keys.length > t.maxKeys) errs.push(`узел ${n.id}: ключей больше лимита`);
    if (n.keys.some((k, i) => i > 0 && n.keys[i - 1] >= k)) errs.push(`узел ${n.id}: ключи не по возрастанию`);
    if (n.keys.some((k) => k < lo || k >= hi)) errs.push(`узел ${n.id}: ключ вне границ родителя`);
    if (n.leaf) depths.add(d);
    else {
      if (n.children.length !== n.keys.length + 1) errs.push(`узел ${n.id}: детей должно быть на один больше ключей`);
      n.children.forEach((c, i) => go(c, d + 1, i === 0 ? lo : n.keys[i - 1], i === n.keys.length ? hi : n.keys[i]));
    }
  };
  go(t.root, 0, -Infinity, Infinity);
  if (depths.size > 1) errs.push('листья на разной глубине');
  return errs;
}
