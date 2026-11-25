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
  'zones-game': () => import('./ZonesGame.tsx').then((m) => m.ZonesGame),
  'threadpool-sim': () => import('./ThreadPoolSim.tsx').then((m) => m.ThreadPoolSim),
  'server-sim': () => import('./ServerSim.tsx').then((m) => m.ServerSim),
  'block-demo': () => import('./BlockDemo.tsx').then((m) => m.BlockDemo),
  'emitter-sim': () => import('./EmitterSim.tsx').then((m) => m.EmitterSim),
  'backpressure-sim': () => import('./BackpressureSim.tsx').then((m) => m.BackpressureSim),
  'shutdown-timeline': () => import('./ShutdownTimeline.tsx').then((m) => m.ShutdownTimeline),
  'sync-vs-async': () => import('./BrokerWidgets.tsx').then((m) => m.SyncVsAsync),
  'rabbit-routing': () => import('./BrokerWidgets.tsx').then((m) => m.RabbitRouting),
  'rabbit-sim': () => import('./BrokerWidgets.tsx').then((m) => m.RabbitSim),
  'kafka-sim': () => import('./BrokerWidgets.tsx').then((m) => m.KafkaSim),
  'delivery-injector': () => import('./BrokerWidgets.tsx').then((m) => m.DeliveryInjector),
  'outbox-viz': () => import('./BrokerWidgets.tsx').then((m) => m.OutboxViz),
  'saga-viz': () => import('./BrokerWidgets.tsx').then((m) => m.SagaViz),
  'idempotency-compare': () => import('./BrokerWidgets.tsx').then((m) => m.IdempotencyCompare),
  'retry-planner': () => import('./BrokerWidgets.tsx').then((m) => m.RetryPlanner),
  'sql-sandbox': () => import('./SqlSandbox.tsx').then((m) => m.SqlSandbox),
  'btree-viz': () => import('./DbWidgets.tsx').then((m) => m.BTreeViz),
  'isolation-sim': () => import('./DbWidgets.tsx').then((m) => m.IsolationSim),
  'deadlock-timeline': () => import('./DbWidgets.tsx').then((m) => m.DeadlockTimeline),
  'redis-terminal': () => import('./RedisWidgets.tsx').then((m) => m.RedisTerminal),
  'ratelimit-sim': () => import('./RedisWidgets.tsx').then((m) => m.RateLimitSim),
  'cache-sim': () => import('./RedisWidgets.tsx').then((m) => m.CacheSim),
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
