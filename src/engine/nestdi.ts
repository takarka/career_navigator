/**
 * Модель внедрения зависимостей NestJS на уровне модулей: видит ли провайдер зависимость.
 * Правило: провайдеру модуля M доступны (1) провайдеры самого M, (2) экспортируемые провайдеры импортированных модулей
 * (экспорт может быть как провайдера, так и модуля — реэкспорт), (3) экспортируемые провайдеры глобальных модулей (@Global).
 * Проверяется автотестом на настоящем NestJS (nest-fixture/di.ts).
 */
export interface ModuleDef {
  name: string;
  imports?: string[];
  providers?: { name: string; deps?: string[] }[];
  /** Имена провайдеров или модулей (реэкспорт). */
  exports?: string[];
  global?: boolean;
}

export interface Graph {
  modules: ModuleDef[];
}

export interface Problem {
  module: string;
  provider: string;
  dep: string;
}

/** Множество провайдеров, которые модуль выставляет наружу (с учётом реэкспорта модулей). */
function exported(g: Graph, m: ModuleDef, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(m.name)) return out;
  seen.add(m.name);
  for (const e of m.exports ?? []) {
    const asModule = g.modules.find((x) => x.name === e);
    if (asModule && !(m.providers ?? []).some((p) => p.name === e)) exported(g, asModule, seen).forEach((x) => out.add(x));
    else out.add(e);
  }
  return out;
}

/** Модули, достижимые от корневого AppModule по imports (только они входят в приложение). */
export function reachable(g: Graph): ModuleDef[] {
  const seen = new Set<string>();
  const walk = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const i of g.modules.find((x) => x.name === name)?.imports ?? []) walk(i);
  };
  walk('AppModule');
  return g.modules.filter((x) => seen.has(x.name));
}

export function visibleIn(g: Graph, m: ModuleDef): Set<string> {
  const vis = new Set<string>((m.providers ?? []).map((p) => p.name));
  for (const imp of m.imports ?? []) {
    const im = g.modules.find((x) => x.name === imp);
    if (im) exported(g, im).forEach((x) => vis.add(x));
  }
  // @Global не заменяет импорт: глобальный модуль должен быть подключён где-то в дереве (обычно в корневом модуле)
  for (const gm of reachable(g).filter((x) => x.global)) exported(g, gm).forEach((x) => vis.add(x));
  return vis;
}

/** Зависимости, которые не будут разрешены. Пустой список — приложение запустится. */
export function unresolved(g: Graph): Problem[] {
  const out: Problem[] = [];
  for (const m of reachable(g)) {
    const vis = visibleIn(g, m);
    for (const p of m.providers ?? []) for (const d of p.deps ?? []) if (!vis.has(d)) out.push({ module: m.name, provider: p.name, dep: d });
  }
  return out;
}

export const diScenarios: { id: string; title: string; why: string; graph: Graph }[] = [
  { id: 'same', title: 'Провайдер в том же модуле', why: 'Зависимость объявлена в providers того же модуля.', graph: { modules: [{ name: 'AppModule', providers: [{ name: 'A' }, { name: 'B', deps: ['A'] }] }] } },
  { id: 'not-imported', title: 'Модуль не импортирован', why: 'B лежит в другом модуле, но AppModule его не импортировал.', graph: { modules: [{ name: 'AModule', providers: [{ name: 'A' }], exports: ['A'] }, { name: 'AppModule', providers: [{ name: 'B', deps: ['A'] }] }] } },
  { id: 'not-exported', title: 'Импортирован, но не экспортирован', why: 'Модуль AModule импортирован, но не экспортирует A: снаружи провайдер не виден.', graph: { modules: [{ name: 'AModule', providers: [{ name: 'A' }] }, { name: 'AppModule', imports: ['AModule'], providers: [{ name: 'B', deps: ['A'] }] }] } },
  { id: 'exported', title: 'Импорт + экспорт', why: 'AModule экспортирует A, AppModule импортирует AModule: провайдер виден.', graph: { modules: [{ name: 'AModule', providers: [{ name: 'A' }], exports: ['A'] }, { name: 'AppModule', imports: ['AModule'], providers: [{ name: 'B', deps: ['A'] }] }] } },
  { id: 'global', title: 'Глобальный модуль', why: 'AModule подключён в корне и помечен @Global: BModule видит A без собственного импорта.', graph: { modules: [{ name: 'AModule', global: true, providers: [{ name: 'A' }], exports: ['A'] }, { name: 'BModule', providers: [{ name: 'B', deps: ['A'] }] }, { name: 'AppModule', imports: ['AModule', 'BModule'] }] } },
  { id: 'global-not-imported', title: 'Глобальный, но нигде не подключён', why: '@Global не подключает модуль сам: если ни один модуль дерева его не импортирует, его провайдеров в приложении нет.', graph: { modules: [{ name: 'AModule', global: true, providers: [{ name: 'A' }], exports: ['A'] }, { name: 'BModule', providers: [{ name: 'B', deps: ['A'] }] }, { name: 'AppModule', imports: ['BModule'] }] } },
  { id: 'global-not-exported', title: 'Глобальный, но без экспорта', why: '@Global не отменяет экспорт: провайдер должен быть в exports.', graph: { modules: [{ name: 'AModule', global: true, providers: [{ name: 'A' }] }, { name: 'BModule', providers: [{ name: 'B', deps: ['A'] }] }, { name: 'AppModule', imports: ['AModule', 'BModule'] }] } },
  { id: 're-export', title: 'Реэкспорт модуля', why: 'CoreModule импортирует AModule и реэкспортирует его: AppModule видит A, импортируя только CoreModule.', graph: { modules: [{ name: 'AModule', providers: [{ name: 'A' }], exports: ['A'] }, { name: 'CoreModule', imports: ['AModule'], exports: ['AModule'] }, { name: 'AppModule', imports: ['CoreModule'], providers: [{ name: 'B', deps: ['A'] }] }] } },
  { id: 'transitive', title: 'Транзитивный импорт без реэкспорта', why: 'AppModule → CoreModule → AModule: без реэкспорта A за пределами CoreModule не виден.', graph: { modules: [{ name: 'AModule', providers: [{ name: 'A' }], exports: ['A'] }, { name: 'CoreModule', imports: ['AModule'] }, { name: 'AppModule', imports: ['CoreModule'], providers: [{ name: 'B', deps: ['A'] }] }] } },
];
