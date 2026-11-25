import type { QuizQuestion } from './types.ts';

/**
 * Детерминированно вращает варианты ответов (вопрос i сдвигается на i позиций),
 * чтобы правильные ответы не оказывались все на одной позиции. Содержание вопросов не меняется.
 */
export function varyAnswers(questions: QuizQuestion[]): QuizQuestion[] {
  return questions.map((q, i) => {
    const n = q.options.length;
    const shift = i % n;
    const options = q.options.map((_, j) => q.options[(j - shift + n) % n]);
    return { ...q, options, answer: (q.answer + shift) % n };
  });
}
