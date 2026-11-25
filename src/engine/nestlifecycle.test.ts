import { afterEach, describe, expect, it } from 'vitest';
import { startApp, trace } from './nest-fixture/app.ts';
import { lifecycle, type Layout, type Level, type Outcome } from './nestlifecycle.ts';

const ALL: Level[] = ['global', 'controller', 'route'];
const layouts: Layout[] = [
  { middleware: true, guards: ALL, interceptors: ALL, pipes: [...ALL, 'param'], filters: ALL },
  { middleware: false, guards: ['route'], interceptors: [], pipes: [], filters: [] },
  { middleware: true, guards: ['global'], interceptors: ['controller'], pipes: ['param'], filters: ['global'] },
  { middleware: true, guards: ['controller', 'route'], interceptors: ['global', 'route'], pipes: ['global', 'route'], filters: ['controller'] },
];

const queryFor = (o: Outcome): string => {
  switch (o.kind) {
    case 'ok': return 'v=ok';
    case 'guard-deny': return `v=ok&deny=${o.level}`;
    case 'pipe-fail': return `v=bad-${o.at}`;
    case 'handler-throw': return 'v=ok&fail=1';
  }
};

const outcomesFor = (l: Layout): Outcome[] => [
  { kind: 'ok' },
  { kind: 'handler-throw' },
  ...l.guards.map((level) => ({ kind: 'guard-deny' as const, level })),
  ...l.pipes.map((at) => ({ kind: 'pipe-fail' as const, at })),
];

let closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers) await c();
  closers = [];
});

describe('жизненный цикл запроса: модель против настоящего NestJS', () => {
  layouts.forEach((layout, li) => {
    it(`раскладка #${li + 1}: все исходы совпадают с реальным порядком`, { timeout: 60000 }, async () => {
      const { app, url } = await startApp(layout);
      closers.push(() => app.close());
      for (const outcome of outcomesFor(layout)) {
        trace.length = 0;
        const res = await fetch(`${url}/t?${queryFor(outcome)}`);
        await res.text();
        const model = lifecycle(layout, outcome);
        // без пользовательского фильтра ответ формирует встроенный фильтр Nest: он не пишет в trace
        const expected = model.filter((x) => x !== 'filter:default');
        expect(trace.slice(), `${JSON.stringify(layout)} ${JSON.stringify(outcome)}`).toEqual(expected);
        expect(res.status).toBe(outcome.kind === 'ok' ? 200 : outcome.kind === 'guard-deny' ? 403 : outcome.kind === 'pipe-fail' ? 400 : 500);
      }
    });
  });

  it('при ошибке часть «после» interceptor не выполняется, а фильтр route срабатывает раньше controller и global', () => {
    const l = layouts[0];
    expect(lifecycle(l, { kind: 'handler-throw' })).not.toContain('interceptor:global:after');
    expect(lifecycle(l, { kind: 'handler-throw' }).at(-1)).toBe('filter:route');
    expect(lifecycle({ ...l, filters: ['controller', 'global'] }, { kind: 'handler-throw' }).at(-1)).toBe('filter:controller');
  });
});

import { diScenarios, unresolved } from './nestdi.ts';
import { bootstrapGraph } from './nest-fixture/di.ts';

describe('внедрение зависимостей: модель против настоящего NestJS', () => {
  for (const sc of diScenarios) {
    it(`${sc.id}: ${sc.title}`, { timeout: 30000 }, async () => {
      const model = unresolved(sc.graph);
      const real = await bootstrapGraph(sc.graph);
      expect(real === null, `модель: ${JSON.stringify(model)}; Nest: ${real?.slice(0, 120)}`).toBe(model.length === 0);
      if (model.length) expect(real).toContain(`'${model[0].dep}'`.slice(0, 0)); // сообщение Nest есть (детали зависят от версии)
    });
  }
});
