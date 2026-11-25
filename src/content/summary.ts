import type { Lesson, QuizQuestion } from './types.ts';

/** Собирает вопросы всех квизов уроков и выбирает n разных, равномерно по урокам. Порядок задаётся seed. */
export function buildSummary(lessons: Lesson[], n = 12, seed = 1): QuizQuestion[] {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const pools = lessons.map((l) => l.blocks.flatMap((b) => (b.t === 'quiz' ? b.questions : [])));
  for (const p of pools) for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const out: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (let round = 0; out.length < n; round++) {
    let added = false;
    for (const p of pools) {
      const q = p[round];
      if (q && !seen.has(q.q) && out.length < n) { seen.add(q.q); out.push(q); added = true; }
    }
    if (!added) break;
  }
  return out;
}
