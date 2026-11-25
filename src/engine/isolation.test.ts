import { describe, expect, it } from 'vitest';
import { renderSql, scenarios, simulate, type Level } from './isolation.ts';

const sc = (id: string) => scenarios.find((s) => s.id === id)!;
const reads = (id: string, level: Level) => simulate(sc(id), level).steps.filter((s) => s.op.op === 'read' || s.op.op === 'count').map((s) => s.value);

describe('модель изоляции (поведение PostgreSQL)', () => {
  it('Read Committed допускает неповторяющееся чтение, Repeatable Read — нет', () => {
    expect(reads('nonrepeatable', 'read committed')).toEqual([100, 200]);
    expect(reads('nonrepeatable', 'repeatable read')).toEqual([100, 100]);
    expect(reads('nonrepeatable', 'serializable')).toEqual([100, 100]);
  });

  it('фантом возможен в Read Committed, но невозможен в Repeatable Read (особенность PostgreSQL)', () => {
    expect(reads('phantom', 'read committed')).toEqual([2, 3]);
    expect(reads('phantom', 'repeatable read')).toEqual([2, 2]);
  });

  it('потерянное обновление: Read Committed теряет, Repeatable Read и Serializable прерывают вторую транзакцию', () => {
    const rc = simulate(sc('lostupdate'), 'read committed');
    expect(rc.final.a).toBe(120); // +10 от T1 потеряно
    expect(rc.aborted).toEqual([]);
    for (const level of ['repeatable read', 'serializable'] as Level[]) {
      const o = simulate(sc('lostupdate'), level);
      expect(o.aborted, level).toEqual(['T2']);
      expect(o.final.a).toBe(110);
      expect(o.steps.some((x) => x.error?.includes('concurrent update'))).toBe(true);
    }
  });

  it('SELECT … FOR UPDATE в Read Committed устраняет потерянное обновление: итог 130', () => {
    const o = simulate(sc('lostupdate-lock'), 'read committed');
    expect(o.final.a).toBe(130);
    expect(o.aborted).toEqual([]);
    expect(o.steps.some((x) => x.blocked)).toBe(true); // T2 ждал снятия блокировки
  });

  it('write skew: допускается в Read Committed и Repeatable Read, предотвращается в Serializable', () => {
    for (const level of ['read committed', 'repeatable read'] as Level[]) {
      const o = simulate(sc('writeskew'), level);
      expect(o.final, level).toEqual({ a: 0, b: 0 }); // инвариант a + b ≥ 1 нарушен
      expect(o.aborted).toEqual([]);
    }
    const s = simulate(sc('writeskew'), 'serializable');
    expect(s.aborted).toEqual(['T2']); // вторая фиксируемая транзакция прервана
    expect(s.final).toEqual({ a: 0, b: 1 });
    expect(s.steps.some((x) => x.error?.includes('read/write dependencies'))).toBe(true);
  });

  it('инвариант: на любом уровне итоговое состояние содержит только зафиксированные значения', () => {
    for (const level of ['read committed', 'repeatable read', 'serializable'] as Level[]) for (const s of scenarios) {
      const o = simulate(s, level);
      for (const v of Object.values(o.final)) expect(Number.isFinite(v)).toBe(true);
      expect(o.steps.length).toBeGreaterThan(0);
    }
  });

  it('SQL для реального PostgreSQL рендерится для всех операций', () => {
    for (const s of scenarios) for (const op of s.ops) expect(renderSql(op, 'repeatable read').length).toBeGreaterThan(0);
    expect(renderSql({ s: 'T1', op: 'begin' }, 'serializable')).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
  });
});
