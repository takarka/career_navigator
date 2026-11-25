import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const labs = join(import.meta.dirname, '..', '..', 'labs');
const run = (lab: string, args: string[] = []) => spawnSync(process.execPath, ['test.cjs', ...args], { cwd: join(labs, lab), encoding: 'utf8', timeout: 30000 });

/** Правило лабораторий: заготовка (starter) падает, решение (solution) проходит. */
describe('лаборатории', () => {
  it('m01/blocking: заготовка падает, решение проходит', { retry: 2, timeout: 60000 }, () => {
    const starter = run('m01/blocking');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m01/blocking', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });
});
