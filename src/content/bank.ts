import { buildBank, type LessonInterview, type Question } from '../engine/interview.ts';
import { loadAllLessons } from './lessons.ts';
import type { Lesson } from './types.ts';

/** Все блоки interview из готовых уроков. */
export function collectInterviews(lessons: Lesson[]): LessonInterview[] {
  const out: LessonInterview[] = [];
  for (const lesson of lessons) {
    let index = 0;
    for (const b of lesson.blocks) {
      if (b.t === 'interview') out.push({ lessonId: lesson.id, index: index++, q: b.q, a: b.a });
    }
  }
  return out;
}

let cache: Promise<Question[]> | null = null;

/** Банк вопросов: вручную написанные + собранные из уроков. Грузится лениво. */
export function getBank(): Promise<Question[]> {
  cache ??= Promise.all([import('./m14/questions.ts'), loadAllLessons()]).then(([q, lessons]) => buildBank(q.manualQuestions, collectInterviews(lessons)));
  return cache;
}
