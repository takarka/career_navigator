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

  it('m01/emitter-leak: заготовка падает, решение проходит', { retry: 2, timeout: 60000 }, () => {
    const starter = run('m01/emitter-leak');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m01/emitter-leak', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m01/streams: заготовка падает по памяти, решение проходит', { retry: 1, timeout: 90000 }, () => {
    const starter = run('m01/streams');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m01/streams', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m01/graceful: заготовка падает, решение проходит', { retry: 2, timeout: 60000 }, () => {
    const starter = run('m01/graceful');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m01/graceful', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });
});
