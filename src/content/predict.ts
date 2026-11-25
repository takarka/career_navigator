import { toSource } from '../engine/eventloop.ts';
import { scenarios } from './m01/scenarios.ts';
import tracesFile from './m01/traces.json';

/** Одно задание «угадай вывод»: код, эталонный вывод и разбор. */
export interface PredictItem {
  id: string;
  title: string;
  intro: string;
  code: string;
  /** Эталонный вывод построчно (записан из реального запуска). */
  answer: string[];
  explanation: string[];
}

const eventLoop: PredictItem[] = scenarios
  .filter((s) => s.deterministic)
  .map((s) => ({
    id: s.id,
    title: s.title,
    intro: s.intro,
    code: toSource(s.ops),
    answer: (tracesFile.traces as Record<string, string[]>)[s.id],
    explanation: s.explanation,
  }));

/** Наборы заданий по именам. Новый модуль добавляет свой набор сюда. */
export const predictSets: Record<string, PredictItem[]> = {
  'event-loop': eventLoop,
};
