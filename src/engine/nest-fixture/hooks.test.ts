import { describe, expect, it } from 'vitest';
import { runHooks } from './hooks.ts';

describe('хуки жизненного цикла NestJS (настоящее приложение)', () => {
  it('порядок: init → bootstrap, при остановке destroy → beforeShutdown → shutdown', { timeout: 30000 }, async () => {
    expect(await runHooks()).toEqual([
      '— listen —', // NestFactory.create() хуки не вызывает: они запускаются при app.init() или app.listen()
      'A.onModuleInit',
      'A.onApplicationBootstrap',
      '— close —',
      'A.onModuleDestroy',
      'A.beforeApplicationShutdown',
      'A.onApplicationShutdown',
    ]);
  });
});
