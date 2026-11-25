import { describe, expect, it } from 'vitest';
import { cascade, validateDiagram, type DiagramSpec } from './diagram.ts';

const spec: DiagramSpec = {
  nodes: [
    { id: 'web', kind: 'client', label: 'Web', x: 0, y: 0 },
    { id: 'api', kind: 'service', label: 'API', x: 0, y: 0 },
    { id: 'pay', kind: 'service', label: 'Payments', x: 0, y: 0 },
    { id: 'db', kind: 'db', label: 'DB', x: 0, y: 0 },
    { id: 'q', kind: 'queue', label: 'Queue', x: 0, y: 0 },
    { id: 'mail', kind: 'service', label: 'Mailer', x: 0, y: 0 },
  ],
  edges: [
    { from: 'web', to: 'api', sync: true },
    { from: 'api', to: 'pay', sync: true },
    { from: 'pay', to: 'db', sync: true },
    { from: 'api', to: 'q', sync: false },
    { from: 'mail', to: 'q', sync: true },
  ],
};

describe('diagram', () => {
  it('валидная схема', () => expect(validateDiagram(spec)).toEqual([]));
  it('без отказов всё ok', () => expect(Object.values(cascade(spec, new Set())).every((h) => h === 'ok')).toBe(true));
  it('отказ БД каскадом роняет синхронную цепочку', () => {
    const h = cascade(spec, new Set(['db']));
    expect(h).toMatchObject({ db: 'down', pay: 'down', api: 'down', web: 'down', q: 'ok', mail: 'ok' });
  });
  it('защищённый сервис останавливает каскад (деградация)', () => {
    const protectedSet = new Set(['api']);
    const h = cascade(spec, new Set(['db']), protectedSet);
    expect(h).toMatchObject({ pay: 'down', api: 'degraded' });
    expect(h.web).toBe('degraded'); // web получает урезанный ответ, но не падает
  });
  it('отказ очереди не затрагивает продюсера (асинхронная связь)', () => {
    const h = cascade(spec, new Set(['q']));
    expect(h.api).toBe('ok');
    expect(h.mail).toBe('down');
  });
  it('циклы не зацикливают расчёт', () => {
    const cyc: DiagramSpec = { nodes: spec.nodes.slice(0, 2), edges: [{ from: 'web', to: 'api', sync: true }, { from: 'api', to: 'web', sync: true }] };
    expect(cascade(cyc, new Set(['web']))).toEqual({ web: 'down', api: 'down' });
  });
  it('находит неизвестные узлы', () => {
    expect(validateDiagram({ nodes: spec.nodes, edges: [{ from: 'x', to: 'api', sync: true }] })).toHaveLength(1);
  });
});
