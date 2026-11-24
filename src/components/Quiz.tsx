import { useState } from 'preact/hooks';
import type { QuizQuestion } from '../content/types.ts';
import { Markdown } from './Markdown.tsx';
import { update, useProgress } from '../app/state.ts';

export function Quiz({ id, title, questions }: { id: string; title?: string; questions: QuizQuestion[] }) {
  const progress = useProgress();
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const done = answers.every((a) => a !== null);
  const score = answers.filter((a, i) => a === questions[i].answer).length;
  const best = progress.quizzes[id];

  const choose = (qi: number, oi: number) => {
    if (answers[qi] !== null) return;
    const next = answers.map((a, i) => (i === qi ? oi : a));
    setAnswers(next);
    if (next.every((a) => a !== null)) {
      const s = next.filter((a, i) => a === questions[i].answer).length;
      update((p) => {
        const prev = p.quizzes[id];
        if (!prev || s >= prev.score) p.quizzes[id] = { score: s, total: questions.length };
      });
    }
  };

  return (
    <div class="quiz">
      <div class="quiz-head">
        <b>{title ?? 'Проверь себя'}</b>
        {best && <span class="muted">лучший результат: {best.score}/{best.total}</span>}
      </div>
      {questions.map((q, qi) => (
        <div class="quiz-q" key={qi}>
          <div class="q-text"><span class="q-num">{qi + 1}.</span> <Markdown text={q.q} inline /></div>
          <div class="opts">
            {q.options.map((o, oi) => {
              const chosen = answers[qi];
              const cls = chosen === null ? '' : oi === q.answer ? 'right' : oi === chosen ? 'wrong' : 'dim';
              return (
                <button key={oi} class={`opt ${cls}`} onClick={() => choose(qi, oi)} disabled={chosen !== null}>
                  <Markdown text={o} inline />
                </button>
              );
            })}
          </div>
          {answers[qi] !== null && (
            <div class={`feedback ${answers[qi] === q.answer ? 'ok' : 'no'}`}>
              <b>{answers[qi] === q.answer ? 'Верно. ' : 'Не совсем. '}</b>
              <Markdown text={q.explain} inline />
            </div>
          )}
        </div>
      ))}
      {done && (
        <div class="quiz-result">
          Результат: <b>{score} из {questions.length}</b>
          <button onClick={() => setAnswers(questions.map(() => null))}>Пройти заново</button>
        </div>
      )}
    </div>
  );
}
