import type { Lesson } from './types.ts';

/**
 * Готовые уроки: id -> ленивый загрузчик. Каждый урок собирается в отдельный чанк,
 * поэтому стартовый бандл не растёт вместе с числом уроков.
 * Остальные уроки из modules.ts показываются как «скоро».
 * Новый урок = одна строка здесь.
 */
export const lessonLoaders: Record<string, () => Promise<Lesson>> = {
  'm01-l01': () => import('./m01/architecture.ts').then((m) => m.architecture),
  'm01-l03': () => import('./m01/blocking.ts').then((m) => m.blocking),
  'm01-l04': () => import('./m01/emitter.ts').then((m) => m.emitterLesson),
  'm01-l05': () => import('./m01/streams.ts').then((m) => m.streams),
  'm01-l06': () => import('./m01/graceful.ts').then((m) => m.graceful),
  'm01-l02': () => import('./m01/event-loop.ts').then((m) => m.eventLoop),
  'm14-l01': () => import('./m14/l01-intro.ts').then((m) => m.introLesson),
  'm14-l02': () => import('./m14/l02-star.ts').then((m) => m.starLesson),
  'm14-l03': () => import('./m14/l03-live.ts').then((m) => m.liveLesson),
  'm14-l04': () => import('./m14/l04-l05.ts').then((m) => m.salaryLesson),
  'm14-l05': () => import('./m14/l04-l05.ts').then((m) => m.mockLesson),
};

export const isReady = (id: string): boolean => id in lessonLoaders;

const cache = new Map<string, Lesson>();

export async function loadLesson(id: string): Promise<Lesson | undefined> {
  const hit = cache.get(id);
  if (hit) return hit;
  const loader = lessonLoaders[id];
  if (!loader) return undefined;
  const lesson = await loader();
  cache.set(id, lesson);
  return lesson;
}

/** Загружает все готовые уроки (для поиска, банка вопросов, линтера и тестов). */
export async function loadAllLessons(): Promise<Lesson[]> {
  return (await Promise.all(Object.keys(lessonLoaders).map(loadLesson))).filter((l): l is Lesson => !!l);
}
