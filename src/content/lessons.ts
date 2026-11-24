import type { Lesson } from './types.ts';
import { eventLoop } from './m01/event-loop.ts';

/** Готовые уроки. Остальные уроки из modules.ts показываются как «скоро». */
export const lessons: Record<string, Lesson> = {
  [eventLoop.id]: eventLoop,
};
