import { describe, expect, it } from 'vitest';
import { migrate, SCHEMA, emptyProgress } from './migrate.ts';

describe('migrate', () => {
  it('пустое и битое значение дают пустой прогресс', () => {
    expect(migrate(null)).toEqual(emptyProgress());
    expect(migrate('x')).toEqual(emptyProgress());
    expect(migrate([])).toEqual(emptyProgress());
  });

  it('схема 1 (без новых полей) сохраняет данные и получает значения по умолчанию', () => {
    const v1 = { lessons: { 'm01-l02': true }, tasks: { '1.1': true }, predict: {}, quizzes: { q: { score: 4, total: 6 } }, notes: { 'm01-l02': 'заметка' }, theme: 'dark' };
    const p = migrate(v1);
    expect(p.schema).toBe(SCHEMA);
    expect(p.lessons).toEqual({ 'm01-l02': true });
    expect(p.notes['m01-l02']).toBe('заметка');
    expect(p.theme).toBe('dark');
    expect(p.flashcards).toEqual({});
    expect(p.interviewHistory).toEqual([]);
    expect(p.detail).toBe(true);
  });

  it('неверные типы полей заменяются значениями по умолчанию', () => {
    const p = migrate({ lessons: 5, theme: 'pink', detail: 'yes', interviewHistory: {} });
    expect(p.lessons).toEqual({});
    expect(p.theme).toBe('auto');
    expect(p.detail).toBe(true);
    expect(p.interviewHistory).toEqual([]);
  });

  it('идемпотентна', () => {
    const once = migrate({ lessons: { a: true } });
    expect(migrate(once)).toEqual(once);
  });
});
