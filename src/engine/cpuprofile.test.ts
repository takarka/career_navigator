import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTree, flameRects, hottest, type CpuProfile } from './cpuprofile.ts';

const app = join(import.meta.dirname, '..', '..', 'labs', 'm10', 'profile', 'app.cjs');

function realProfile(): CpuProfile {
  const dir = mkdtempSync(join(tmpdir(), 'cpuprof-'));
  execFileSync(process.execPath, ['--cpu-prof', `--cpu-prof-dir=${dir}`, app], { encoding: 'utf8' });
  return JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8')) as CpuProfile;
}

describe('разбор реального CPU-профиля Node.js', () => {
  const profile = realProfile();
  const tree = buildTree(profile);

  it('общее время дерева близко к длительности профиля', () => {
    const wall = profile.endTime - profile.startTime;
    expect(tree.total).toBeGreaterThan(wall * 0.8);
    expect(tree.total).toBeLessThan(wall * 1.2);
  });

  it('самая горячая функция по собственному времени — fib (рекурсивные вызовы суммируются)', () => {
    const top = hottest(tree, 5);
    expect(top[0].name).toBe('fib');
    expect(top[0].share).toBeGreaterThan(0.4);
    expect(top.map((h) => h.name)).toContain('parseJson');
  });

  it('время родителя не меньше суммы времени детей', () => {
    const check = (n: ReturnType<typeof buildTree>) => {
      expect(n.total).toBeGreaterThanOrEqual(n.children.reduce((s, c) => s + c.total, 0) - 1);
      n.children.forEach(check);
    };
    check(tree);
  });

  it('прямоугольники flame graph вкладываются: дети внутри родителя, суммарная ширина детей не больше родителя', () => {
    const rects = flameRects(tree, 0);
    for (const r of rects) {
      const kids = rects.filter((k) => k.depth === r.depth + 1 && k.x >= r.x - 1e-9 && k.x + k.w <= r.x + r.w + 1e-9);
      expect(kids.reduce((s, k) => s + k.w, 0)).toBeLessThanOrEqual(r.w + 1e-6);
    }
    expect(rects[0].w).toBeCloseTo(1, 6);
  });
});
