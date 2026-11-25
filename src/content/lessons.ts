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
  'm08-l01': () => import('./m08/l01-l03.ts').then((m) => m.whyBrokers),
  'm08-l02': () => import('./m08/l01-l03.ts').then((m) => m.rabbit),
  'm08-l03': () => import('./m08/l01-l03.ts').then((m) => m.kafka),
  'm08-l04': () => import('./m08/l04-l08.ts').then((m) => m.guarantees),
  'm08-l05': () => import('./m08/l04-l08.ts').then((m) => m.idempotent),
  'm08-l06': () => import('./m08/l04-l08.ts').then((m) => m.retries),
  'm08-l07': () => import('./m08/l04-l08.ts').then((m) => m.outbox),
  'm08-l08': () => import('./m08/l04-l08.ts').then((m) => m.saga),
  'm03-l01': () => import('./m03/lessons-a.ts').then((m) => m.schemaLesson),
  'm03-l02': () => import('./m03/lessons-a.ts').then((m) => m.indexLesson),
  'm03-l03': () => import('./m03/lessons-a.ts').then((m) => m.mvccLesson),
  'm03-l04': () => import('./m03/lessons-b.ts').then((m) => m.isolationLesson),
  'm03-l05': () => import('./m03/lessons-b.ts').then((m) => m.locksLesson),
  'm03-l06': () => import('./m03/lessons-b.ts').then((m) => m.explainLesson),
  'm03-l07': () => import('./m03/lessons-b.ts').then((m) => m.practiceLesson),
  'm04-l01': () => import('./m04/lessons.ts').then((m) => m.structures),
  'm04-l02': () => import('./m04/lessons.ts').then((m) => m.cacheAside),
  'm04-l03': () => import('./m04/lessons.ts').then((m) => m.cacheProblems),
  'm04-l04': () => import('./m04/lessons.ts').then((m) => m.rateLimit),
  'm04-l05': () => import('./m04/lessons.ts').then((m) => m.atomicity),
  'm06-l01': () => import('./m06/lessons.ts').then((m) => m.modulesDi),
  'm06-l02': () => import('./m06/lessons.ts').then((m) => m.requestLifecycle),
  'm06-l03': () => import('./m06/lessons.ts').then((m) => m.dtoLesson),
  'm06-l04': () => import('./m06/lessons.ts').then((m) => m.dbConfig),
  'm06-l05': () => import('./m06/lessons.ts').then((m) => m.nestVsExpress),
  'm05-l01': () => import('./m05/lessons.ts').then((m) => m.restIdem),
  'm05-l02': () => import('./m05/lessons.ts').then((m) => m.errorsLesson),
  'm05-l03': () => import('./m05/lessons.ts').then((m) => m.authJwt),
  'm05-l04': () => import('./m05/lessons.ts').then((m) => m.openapi),
  'm05-l05': () => import('./m05/lessons.ts').then((m) => m.websocket),
  'm10-l01': () => import('./m10/lessons.ts').then((m) => m.metrics),
  'm10-l02': () => import('./m10/lessons.ts').then((m) => m.cpuProfiling),
  'm10-l03': () => import('./m10/lessons.ts').then((m) => m.memoryGc),
  'm10-l04': () => import('./m10/lessons.ts').then((m) => m.dbIoTuning),
  'm00-l01': () => import('./m00/lessons.ts').then((m) => m.gapMap),
  'm00-l02': () => import('./m00/lessons.ts').then((m) => m.envSetup),
  'm11-l01': () => import('./m11/lessons.ts').then((m) => m.pyramid),
  'm11-l02': () => import('./m11/lessons.ts').then((m) => m.integration),
  'm11-l03': () => import('./m11/lessons.ts').then((m) => m.flaky),
  'm02-l01': () => import('./m02/lessons.ts').then((m) => m.closures),
  'm02-l02': () => import('./m02/lessons.ts').then((m) => m.asyncPatterns),
  'm02-l03': () => import('./m02/lessons.ts').then((m) => m.typescript),
  'm02-l04': () => import('./m02/lessons.ts').then((m) => m.decorators),
  'm09-l01': () => import('./m09/lessons.ts').then((m) => m.solid),
  'm09-l02': () => import('./m09/lessons.ts').then((m) => m.monolith),
  'm09-l03': () => import('./m09/lessons.ts').then((m) => m.resilience),
  'm09-l04': () => import('./m09/lessons.ts').then((m) => m.dataConsistency),
  'm09-l05': () => import('./m09/lessons.ts').then((m) => m.systemDesign),
  'm07-l01': () => import('./m07/lessons.ts').then((m) => m.dockerfile),
  'm07-l02': () => import('./m07/lessons.ts').then((m) => m.multistage),
  'm07-l03': () => import('./m07/lessons.ts').then((m) => m.compose),
  'm12-l01': () => import('./m12/lessons.ts').then((m) => m.soap),
  'm12-l02': () => import('./m12/lessons.ts').then((m) => m.xmlDsig),
  'm12-l03': () => import('./m12/lessons.ts').then((m) => m.pki),
  'm13-l01': () => import('./m13/lessons.ts').then((m) => m.capstoneSpec),
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
