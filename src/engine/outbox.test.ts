import { describe, expect, it } from 'vitest';
import { outboxTimeline, runOutbox, type Crash, type Mode } from './outbox.ts';
import { validateTimeline } from './timeline.ts';

describe('двойная запись и Outbox', () => {
  it('dual write (БД, затем publish): сбой между шагами теряет событие', () => {
    expect(runOutbox({ mode: 'dual-db-first', crash: 'between', inbox: false }).verdict).toBe('событие потеряно');
  });
  it('dual write (publish, затем БД): сбой между шагами даёт призрачное событие', () => {
    expect(runOutbox({ mode: 'dual-publish-first', crash: 'between', inbox: false }).verdict).toBe('призрачное событие');
  });
  it('Outbox: событие не теряется и не бывает призрачным при сбое relay', () => {
    const o = runOutbox({ mode: 'outbox', crash: 'between', inbox: false });
    expect(o.dbChanged).toBe(true);
    expect(o.published).toBeGreaterThanOrEqual(1);
    expect(o.verdict).toBe('дубль у получателя');
  });
  it('Outbox + Inbox: ровно один эффект у получателя даже после сбоя relay', () => {
    expect(runOutbox({ mode: 'outbox', crash: 'between', inbox: true })).toMatchObject({ consumerEffects: 1, verdict: 'ok' });
  });
  it('без сбоев все режимы дают ok', () => {
    for (const mode of ['dual-db-first', 'dual-publish-first', 'outbox'] as Mode[]) expect(runOutbox({ mode, crash: 'none', inbox: false }).verdict).toBe('ok');
  });
  it('инвариант: в режиме outbox событие никогда не теряется', () => {
    for (const crash of ['none', 'between'] as Crash[]) for (const inbox of [false, true]) expect(runOutbox({ mode: 'outbox', crash, inbox }).verdict).not.toBe('событие потеряно');
  });
  it('таймлайны корректны', () => {
    for (const mode of ['dual-db-first', 'dual-publish-first', 'outbox'] as Mode[]) for (const crash of ['none', 'between'] as Crash[]) for (const inbox of [false, true]) expect(validateTimeline(outboxTimeline({ mode, crash, inbox }))).toEqual([]);
  });
});
