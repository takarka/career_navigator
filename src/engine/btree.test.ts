import { describe, expect, it } from 'vitest';
import { createTree, height, inOrder, insert, search, validate } from './btree.ts';

const build = (keys: number[], maxKeys = 3) => keys.reduce((t, k) => insert(t, k), createTree(maxKeys));
const pseudo = (n: number, seed = 1) => {
  let s = seed;
  return Array.from({ length: n }, () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s % 10000));
};

describe('B-tree', () => {
  it('ключи в порядке возрастания и без дублей после любых вставок', () => {
    for (const maxKeys of [2, 3, 4, 7]) {
      const keys = pseudo(300, maxKeys);
      const t = build(keys, maxKeys);
      expect(inOrder(t)).toEqual([...new Set(keys)].sort((a, b) => a - b));
    }
  });

  it('инварианты соблюдаются при возрастающих, убывающих и случайных вставках', () => {
    const seqs = [Array.from({ length: 200 }, (_, i) => i), Array.from({ length: 200 }, (_, i) => 200 - i), pseudo(200, 5)];
    for (const keys of seqs) for (const maxKeys of [2, 3, 5]) expect(validate(build(keys, maxKeys)), `${maxKeys}`).toEqual([]);
  });

  it('высота растёт логарифмически: 1000 ключей при 4 ключах в узле — не более 10 уровней', () => {
    const t = build(Array.from({ length: 1000 }, (_, i) => i), 4);
    expect(height(t)).toBeLessThanOrEqual(10);
    expect(height(t)).toBeGreaterThan(3);
  });

  it('поиск возвращает путь от корня до листа, длина пути равна высоте', () => {
    const t = build(pseudo(100, 9), 3);
    const key = inOrder(t)[40];
    const r = search(t, key);
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(height(t));
    expect(r.path[0]).toBe(t.root.id);
    expect(search(t, -1).found).toBe(false);
  });

  it('вставка существующего ключа не меняет дерево', () => {
    const t = build([1, 2, 3, 4, 5], 3);
    expect(inOrder(insert(t, 3))).toEqual(inOrder(t));
  });

  it('вставка сообщает число делений узлов', () => {
    let t = createTree(3);
    t = insert(insert(insert(t, 1), 2), 3);
    expect(t.lastSplits).toBe(0);
    t = insert(t, 4);
    expect(t.lastSplits).toBeGreaterThanOrEqual(1);
  });
});
