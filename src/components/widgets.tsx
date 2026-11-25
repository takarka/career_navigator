import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyComponent = ComponentType<any>;

/**
 * Реестр виджетов: имя -> ленивый загрузчик. Каждый виджет попадает в свой чанк.
 * Новый виджет добавляется одной строкой.
 */
export const widgetLoaders: Record<string, () => Promise<AnyComponent>> = {
  'event-loop-sim': () => import('./EventLoopSim.tsx').then((m) => m.EventLoopSim),
  'predict-output': () => import('./PredictGame.tsx').then((m) => m.PredictGame),
  sandbox: () => import('./Sandbox.tsx').then((m) => m.Sandbox),
  'demo-page': () => import('../app/demo.tsx').then((m) => m.DemoPage),
  'mock-interview': () => import('./MockInterview.tsx').then((m) => m.MockInterview),
  flashcards: () => import('./Flashcards.tsx').then((m) => m.Flashcards),
  'star-builder': () => import('./StarBuilder.tsx').then((m) => m.StarBuilder),
  'intro-builder': () => import('./IntroBuilder.tsx').then((m) => m.IntroBuilder),
  'diagram-canvas': () => import('./DiagramCanvas.tsx').then((m) => m.DiagramCanvas),
  'salary-table': () => import('./SalaryTable.tsx').then((m) => m.SalaryTable),
  'test-exercise': () => import('./TestExerciseView.tsx').then((m) => m.TestExerciseView),
};

const cache = new Map<string, AnyComponent>();

export function LazyWidget({ name, props }: { name: string; props?: Record<string, unknown> }) {
  const loader = widgetLoaders[name];
  const [Comp, setComp] = useState<AnyComponent | null>(() => cache.get(name) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loader || cache.has(name)) return;
    let alive = true;
    loader().then(
      (c) => {
        cache.set(name, c);
        if (alive) setComp(() => c);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [name]);

  if (!loader) return <p>Виджет «{name}» не найден.</p>;
  if (failed) return <p>Не удалось загрузить виджет «{name}». Обновите страницу.</p>;
  if (!Comp) return <p class="muted" aria-busy="true">Загрузка…</p>;
  return <Comp {...(props ?? {})} />;
}
