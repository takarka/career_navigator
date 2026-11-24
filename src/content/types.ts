export type Mode = 'browser' | 'local' | 'hybrid';

export interface Exercise {
  starter: string;
  /** Ожидаемый вывод console.log построчно. */
  expected: string[];
  /** Сколько мс ждать завершения асинхронных колбэков. */
  settleMs?: number;
  solution?: string;
}

export interface CommandItem {
  cmd: string;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  mode: Mode;
  summary: string;
  steps?: string[];
  commands?: CommandItem[];
  expected?: string;
  hints?: string[];
  /** Пункты для самопроверки. */
  check?: string[];
  widget?: { name: string; props?: Record<string, unknown> };
  exercise?: Exercise;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export type Block =
  | { t: 'md'; text: string }
  | { t: 'callout'; kind: 'info' | 'warn' | 'tip'; title?: string; text: string }
  | { t: 'interview'; q: string; a: string }
  | { t: 'widget'; name: string; props?: Record<string, unknown>; caption?: string; model?: boolean }
  | { t: 'quiz'; id: string; title?: string; questions: QuizQuestion[] }
  | { t: 'task'; task: Task };

export interface Lesson {
  id: string;
  blocks: Block[];
}

export interface LessonRef {
  id: string;
  title: string;
  summary?: string;
}

export interface Module {
  id: string;
  num: number;
  title: string;
  summary: string;
  priority: 'critical' | 'high' | 'medium' | 'base';
  lessons: LessonRef[];
}
