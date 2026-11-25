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

  it('m08/saga: заготовка падает, решение проходит', { timeout: 30000 }, () => {
    const starter = run('m08/saga');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m08/saga', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m08/outbox: заготовка падает, решение проходит (node:sqlite)', { timeout: 30000 }, () => {
    const env = { ...process.env, NODE_NO_WARNINGS: '1' };
    const go = (args: string[]) => spawnSync(process.execPath, ['test.cjs', ...args], { cwd: join(labs, 'm08/outbox'), encoding: 'utf8', env, timeout: 30000 });
    const starter = go([]);
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = go(['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m10/leak: заготовка падает по памяти, решение проходит', { timeout: 90000 }, () => {
    const starter = run('m10/leak');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m10/leak', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m12/soap-mock: заготовка падает, решение проходит', { timeout: 30000 }, () => {
    const starter = run('m12/soap-mock');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m12/soap-mock', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  const hasRedis = spawnSync('redis-server', ['--version']).status === 0;
  it.skipIf(!hasRedis)('m04/lock: заготовка падает, решение проходит (настоящий redis-server)', { timeout: 60000 }, () => {
    const starter = run('m04/lock');
    expect(starter.status, starter.stdout + starter.stderr).toBe(1);
    const solution = run('m04/lock', ['solution']);
    expect(solution.status, solution.stdout + solution.stderr).toBe(0);
  });

  it('m13: эталон capstone (SQLite, Outbox, SOAP-мок) проходит свои тесты', { timeout: 60000 }, () => {
    const env = { ...process.env, NODE_NO_WARNINGS: '1' };
    const r = spawnSync(process.execPath, ['test.cjs'], { cwd: join(labs, 'm13/capstone-reference'), encoding: 'utf8', env, timeout: 60000 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  it('m13: приёмочные тесты проходят на эталоне контракта', { timeout: 60000 }, async () => {
    const { createRequire } = await import('node:module');
    const req = createRequire(import.meta.url);
    const { createServer } = req(join(labs, 'm13/capstone-reference/server.cjs'));
    const server = createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    const { spawn } = await import('node:child_process');
    const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
      const p = spawn(process.execPath, ['test.cjs'], { cwd: join(labs, 'm13/acceptance'), env: { ...process.env, BASE_URL: `http://127.0.0.1:${port}` } });
      let text = '';
      p.stdout.on('data', (d) => (text += d));
      p.on('close', (code) => resolve({ code, text }));
    });
    server.close();
    expect(out.code, out.text).toBe(0);
  });
});
