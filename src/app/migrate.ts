/** Версия схемы прогресса. Увеличивай при изменении структуры и добавляй шаг в migrate(). */
export const SCHEMA = 2;

export interface Progress {
  schema: number;
  lessons: Record<string, true>;
  tasks: Record<string, true>;
  predict: Record<string, true>;
  quizzes: Record<string, { score: number; total: number }>;
  notes: Record<string, string>;
  theme: 'auto' | 'light' | 'dark';
  /** false — режим «Коротко»: блоки md с detail скрыты. */
  detail: boolean;
  /** Коробки Лейтнера: id карточки → { box: 1..5, due: ISO-дата следующего повторения }. */
  flashcards: Record<string, { box: number; due: string }>;
  /** История мок-интервью. */
  interviewHistory: InterviewSession[];
  /** Самооценка по темам: id темы → 0..4. */
  selfAssessment: Record<string, number>;
  /** STAR-истории пользователя. */
  stories: Record<string, StarStory>;
  /** Черновики кода в песочницах: id → код. */
  sandboxDrafts: Record<string, string>;
}

export interface InterviewSession {
  id: string;
  date: string;
  answers: { qid: string; answer: string; selfScore?: number }[];
}

export interface StarStory {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  lesson: string;
}

export const emptyProgress = (): Progress => ({
  schema: SCHEMA,
  lessons: {},
  tasks: {},
  predict: {},
  quizzes: {},
  notes: {},
  theme: 'auto',
  detail: true,
  flashcards: {},
  interviewHistory: [],
  selfAssessment: {},
  stories: {},
  sandboxDrafts: {},
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Приводит сохранённые данные любой версии к текущей схеме.
 * Неизвестные или битые поля заменяются значениями по умолчанию, данные пользователя не теряются.
 */
export function migrate(raw: unknown): Progress {
  const base = emptyProgress();
  if (!isObj(raw)) return base;
  const out: Progress = { ...base };
  for (const k of ['lessons', 'tasks', 'predict', 'quizzes', 'notes', 'flashcards', 'selfAssessment', 'stories', 'sandboxDrafts'] as const) {
    if (isObj(raw[k])) (out[k] as unknown) = raw[k];
  }
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'auto') out.theme = raw.theme;
  if (typeof raw.detail === 'boolean') out.detail = raw.detail;
  if (Array.isArray(raw.interviewHistory)) out.interviewHistory = raw.interviewHistory as InterviewSession[];
  // схема 1 → 2: добавлены flashcards, interviewHistory, selfAssessment, stories, sandboxDrafts (значения по умолчанию выше)
  out.schema = SCHEMA;
  return out;
}
