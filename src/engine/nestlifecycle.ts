/**
 * Порядок жизненного цикла запроса в NestJS (модель). Проверяется автотестом на настоящем NestJS (nest-fixture/app.ts):
 *  middleware → guards (global → controller → route) → interceptors, часть «до» (global → controller → route) →
 *  pipes (global → controller → route → параметр) → обработчик → interceptors, часть «после» (в обратном порядке) →
 *  exception filters (route → controller → global; срабатывает первый найденный).
 * Ошибка на любом шаге пропускает остальные шаги и передаёт управление фильтру. Часть «после» interceptor выполняется только при успехе.
 */
export type Level = 'global' | 'controller' | 'route';
export interface Layout {
  middleware: boolean;
  guards: Level[];
  interceptors: Level[];
  pipes: (Level | 'param')[];
  filters: Level[];
}

export type Outcome = { kind: 'ok' } | { kind: 'guard-deny'; level: Level } | { kind: 'pipe-fail'; at: Level | 'param' } | { kind: 'handler-throw' };

const ORDER: Level[] = ['global', 'controller', 'route'];
const inOrder = <T extends string>(present: T[], order: T[]) => order.filter((l) => present.includes(l));

export function lifecycle(layout: Layout, outcome: Outcome): string[] {
  const out: string[] = [];
  if (layout.middleware) out.push('middleware');
  const fail = (): string[] => {
    const f = [...ORDER].reverse().find((l) => layout.filters.includes(l));
    out.push(f ? `filter:${f}` : 'filter:default');
    return out;
  };
  for (const l of inOrder(layout.guards, ORDER)) {
    out.push(`guard:${l}`);
    if (outcome.kind === 'guard-deny' && outcome.level === l) return fail();
  }
  const interceptors = inOrder(layout.interceptors, ORDER);
  for (const l of interceptors) out.push(`interceptor:${l}:before`);
  for (const l of inOrder(layout.pipes, [...ORDER, 'param'] as (Level | 'param')[])) {
    out.push(`pipe:${l}`);
    if (outcome.kind === 'pipe-fail' && outcome.at === l) return fail();
  }
  out.push('handler');
  if (outcome.kind === 'handler-throw') return fail();
  for (const l of [...interceptors].reverse()) out.push(`interceptor:${l}:after`);
  return out;
}

export const stepLabel: Record<string, string> = {
  middleware: 'Middleware',
  guard: 'Guard (можно ли выполнять запрос)',
  interceptor: 'Interceptor',
  pipe: 'Pipe (проверка и преобразование параметра)',
  handler: 'Обработчик контроллера',
  filter: 'Exception filter (формирует ответ при ошибке)',
};
