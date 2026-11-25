import { describe, expect, it } from 'vitest';
import { emptyProgress } from '../app/migrate.ts';
import { buildBank, exportForChat, extractKeyPoints, pickQuestions, scoreFromChecklist, sessionReport, shuffle, validateQuestions, weakModules, type Question } from './interview.ts';

const q = (id: string, module: string, kind: Question['kind'] = 'tech'): Question => ({
  id,
  module,
  tags: [],
  level: 'middle',
  kind,
  question: `Вопрос ${id}`,
  keyPoints: ['пункт один', 'пункт два'],
  referenceAnswer: 'Эталонный ответ',
  followUps: [],
});

describe('банк вопросов', () => {
  it('extractKeyPoints берёт пункты списка или первые предложения', () => {
    expect(extractKeyPoints('- первый пункт\n- второй пункт\n- третий')).toEqual(['первый пункт', 'второй пункт', 'третий']);
    const sentences = extractKeyPoints('Первое предложение достаточно длинное. Второе предложение тоже длинное! Короткое.');
    expect(sentences).toEqual(['Первое предложение достаточно длинное.', 'Второе предложение тоже длинное!']);
  });

  it('buildBank добавляет вопросы из блоков interview и ловит дубликаты id', () => {
    const bank = buildBank([q('m09-x', 'm09')], [{ lessonId: 'm01-l02', index: 0, q: 'Как работает event loop?', a: 'Один поток. Колбэки ждут в очередях. Фазы идут по кругу.' }]);
    expect(bank.map((b) => b.id)).toEqual(['m09-x', 'm01-l02-q1']);
    expect(bank[1].module).toBe('m01');
    expect(() => buildBank([q('a', 'm01'), q('a', 'm01')], [])).toThrow('повторяющийся');
  });

  it('validateQuestions находит проблемы', () => {
    expect(validateQuestions([q('a', 'm01')])).toEqual([]);
    const bad = { ...q('b', 'zz'), keyPoints: ['один'], referenceAnswer: '' };
    expect(validateQuestions([bad]).length).toBe(3);
  });
});

describe('подбор и оценка', () => {
  const bank = [q('1', 'm01'), q('2', 'm01', 'hr'), q('3', 'm08'), q('4', 'm08', 'mgmt'), q('5', 'm03')];

  it('shuffle детерминирован и сохраняет элементы', () => {
    expect(shuffle([1, 2, 3, 4, 5], 7)).toEqual(shuffle([1, 2, 3, 4, 5], 7));
    expect([...shuffle([1, 2, 3, 4, 5], 7)].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('pickQuestions фильтрует по модулю и типу, приоритет слабым модулям', () => {
    expect(pickQuestions(bank, { modules: ['m08'] }, 10, 1).map((x) => x.module)).toEqual(['m08', 'm08']);
    expect(pickQuestions(bank, { kinds: ['hr'] }, 10, 1).map((x) => x.id)).toEqual(['2']);
    const firstWeak = pickQuestions(bank, {}, 5, 3, ['m03'])[0];
    expect(firstWeak.module).toBe('m03');
  });

  it('scoreFromChecklist в диапазоне 1..10', () => {
    expect(scoreFromChecklist(0, 4)).toBe(1);
    expect(scoreFromChecklist(2, 4)).toBe(5);
    expect(scoreFromChecklist(4, 4)).toBe(10);
    expect(scoreFromChecklist(0, 0)).toBe(1);
  });

  it('weakModules объединяет тесты, интервью и самооценку', () => {
    const p = emptyProgress();
    p.quizzes['m01-l02'] = { score: 2, total: 6 };
    p.quizzes['m03-l01'] = { score: 6, total: 6 };
    p.selfAssessment['m08'] = 1;
    p.interviewHistory.push({ id: 's', date: '2026-11-25', answers: [{ qid: '5', answer: 'x', selfScore: 4 }] });
    const weak = weakModules(p, bank);
    expect(weak).toContain('m01');
    expect(weak).toContain('m08');
    // m08 (самооценка 1 из 4 → 2.5) хуже m01 (2 из 6 → 3.3), m03 (интервью 4 и тест 10 → 7) вне слабых
    expect(weak).toEqual(['m08', 'm01']);
  });

  it('sessionReport и экспорт для чата', () => {
    const s = { id: 's1', date: '2026-11-25', answers: [{ qid: '1', answer: 'мой ответ', selfScore: 8 }, { qid: '3', answer: '', selfScore: 3 }] };
    const r = sessionReport(s, bank);
    expect(r.avg).toBe(5.5);
    expect(r.weak).toEqual(['m08']);
    expect(r.answered).toBe(1);
    const text = exportForChat(s, bank);
    expect(text).toContain('Вопрос 1 (m01, tech)');
    expect(text).toContain('мой ответ');
    expect(text).toContain('(без ответа)');
    expect(text).toContain('Моя самооценка: 8/10');
  });
});
