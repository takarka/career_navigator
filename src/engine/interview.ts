import type { InterviewSession, Progress } from '../app/migrate.ts';

export type Level = 'junior' | 'middle' | 'senior';
export type QKind = 'hr' | 'tech' | 'mgmt' | 'live' | 'design';

export interface Question {
  id: string;
  /** Модуль учебника: m01…m14. */
  module: string;
  tags: string[];
  level: Level;
  kind: QKind;
  question: string;
  /** Ключевые пункты хорошего ответа; по ним проходит самооценка. */
  keyPoints: string[];
  referenceAnswer: string;
  followUps: string[];
}

export interface LessonInterview {
  lessonId: string;
  index: number;
  q: string;
  a: string;
}

/** Ключевые пункты из markdown-ответа: пункты списка, иначе первые предложения. */
export function extractKeyPoints(answer: string, max = 5): string[] {
  const clean = (s: string) => s.replace(/[*`_]/g, '').replace(/\s+/g, ' ').trim();
  const bullets = answer
    .split('\n')
    .map((l) => l.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)?.[1])
    .filter((x): x is string => !!x)
    .map(clean);
  if (bullets.length >= 2) return bullets.slice(0, max);
  return answer
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter((s) => s.length > 15)
    .slice(0, max);
}

/** Банк = вручную написанные вопросы + блоки interview из готовых уроков. */
export function buildBank(manual: Question[], interviews: LessonInterview[]): Question[] {
  const fromLessons: Question[] = interviews.map((i) => ({
    id: `${i.lessonId}-q${i.index + 1}`,
    module: i.lessonId.split('-')[0],
    tags: [i.lessonId],
    level: 'middle',
    kind: 'tech',
    question: i.q,
    keyPoints: extractKeyPoints(i.a),
    referenceAnswer: i.a,
    followUps: [],
  }));
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of [...manual, ...fromLessons]) {
    if (seen.has(q.id)) throw new Error(`повторяющийся id вопроса: ${q.id}`);
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

export function validateQuestions(bank: Question[]): string[] {
  const errs: string[] = [];
  for (const q of bank) {
    if (!q.question.trim()) errs.push(`${q.id}: пустой вопрос`);
    if (!q.referenceAnswer.trim()) errs.push(`${q.id}: нет эталонного ответа`);
    if (q.keyPoints.length < 2) errs.push(`${q.id}: нужно минимум 2 ключевых пункта`);
    if (!/^m\d\d$/.test(q.module)) errs.push(`${q.id}: неверный модуль ${q.module}`);
  }
  return errs;
}

/** Детерминированный перемешиватель (LCG), чтобы выбор вопросов можно было воспроизвести. */
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Filter {
  modules?: string[];
  kinds?: QKind[];
  levels?: Level[];
}

export function pickQuestions(bank: Question[], f: Filter, n: number, seed: number, prefer?: string[]): Question[] {
  const pool = bank.filter((q) => (!f.modules?.length || f.modules.includes(q.module)) && (!f.kinds?.length || f.kinds.includes(q.kind)) && (!f.levels?.length || f.levels.includes(q.level)));
  const shuffled = shuffle(pool, seed);
  if (prefer?.length) {
    const first = shuffled.filter((q) => prefer.includes(q.module));
    const rest = shuffled.filter((q) => !prefer.includes(q.module));
    return [...first, ...rest].slice(0, n);
  }
  return shuffled.slice(0, n);
}

/** Оценка 1..10 по доле отмеченных ключевых пунктов. */
export function scoreFromChecklist(checked: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.round((checked / total) * 10));
}

/** Модули, где результаты слабее: тесты (< 70%), оценки интервью (< 6) и самооценка (< 2 из 4). Хуже — раньше. */
export function weakModules(p: Progress, bank: Question[]): string[] {
  const score: Record<string, number[]> = {};
  const push = (m: string, v: number) => (score[m] ??= []).push(v);
  for (const [quizId, r] of Object.entries(p.quizzes)) {
    const m = quizId.match(/^m\d\d/)?.[0];
    if (m && r.total > 0) push(m, (r.score / r.total) * 10);
  }
  const moduleOf = new Map(bank.map((q) => [q.id, q.module]));
  for (const s of p.interviewHistory) for (const a of s.answers) {
    const m = moduleOf.get(a.qid);
    if (m && a.selfScore) push(m, a.selfScore);
  }
  for (const [m, v] of Object.entries(p.selfAssessment)) push(m, (v / 4) * 10);
  return Object.entries(score)
    .map(([m, v]) => [m, v.reduce((s, x) => s + x, 0) / v.length] as const)
    .filter(([, avg]) => avg < 6.5)
    .sort((a, b) => a[1] - b[1])
    .map(([m]) => m);
}

export function sessionReport(s: InterviewSession, bank: Question[]) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const scored = s.answers.filter((a) => a.selfScore);
  const avg = scored.length ? scored.reduce((sum, a) => sum + (a.selfScore ?? 0), 0) / scored.length : 0;
  const perModule: Record<string, number[]> = {};
  for (const a of scored) {
    const m = byId.get(a.qid)?.module;
    if (m) (perModule[m] ??= []).push(a.selfScore!);
  }
  const weak = Object.entries(perModule)
    .map(([m, v]) => [m, v.reduce((x, y) => x + y, 0) / v.length] as const)
    .filter(([, a]) => a < 6.5)
    .sort((x, y) => x[1] - y[1])
    .map(([m]) => m);
  return { avg, weak, answered: s.answers.filter((a) => a.answer.trim()).length, total: s.answers.length };
}

/** Текст для вставки в чат с Claude: просит оценить ответы и разобрать ошибки. Автоматической оценки на сайте нет. */
export function exportForChat(s: InterviewSession, bank: Question[]): string {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const lines: string[] = [
    'Ты опытный интервьюер на позицию Middle Node.js-разработчика. Ниже мои ответы на вопросы мок-интервью.',
    'Для каждого ответа: 1) оценка по шкале 1–10; 2) что верно; 3) ошибки и пробелы; 4) пример сильного ответа (60–90 секунд устной речи).',
    'В конце: общая оценка, три главные слабые темы и что повторить в первую очередь.',
    '',
  ];
  s.answers.forEach((a, i) => {
    const q = byId.get(a.qid);
    lines.push(`### Вопрос ${i + 1}${q ? ` (${q.module}, ${q.kind})` : ''}`, q?.question ?? a.qid, '', '**Мой ответ:**', a.answer.trim() || '(без ответа)');
    if (a.selfScore) lines.push('', `Моя самооценка: ${a.selfScore}/10`);
    lines.push('');
  });
  return lines.join('\n');
}
