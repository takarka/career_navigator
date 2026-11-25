import { describe, expect, it } from 'vitest';
import { crashPoints, deliveryTimeline, describeCrash, runDelivery, type AckMode, type CrashPoint } from './delivery.ts';
import { validateTimeline } from './timeline.ts';

describe('гарантии доставки', () => {
  it('без сбоев: одна доставка и один эффект в обоих режимах', () => {
    for (const ackMode of ['after', 'before'] as AckMode[]) for (const idempotent of [false, true]) expect(runDelivery({ ackMode, crash: 'none', idempotent })).toMatchObject({ effects: 1, deliveries: 1, verdict: 'ok' });
  });

  it('ack после обработки: падение до обработки → повтор, эффект один', () => {
    expect(runDelivery({ ackMode: 'after', crash: 'before-process', idempotent: false })).toMatchObject({ effects: 1, deliveries: 2, verdict: 'ok' });
  });

  it('ack после обработки: падение до ack → дубль эффекта без идемпотентности (at-least-once)', () => {
    expect(runDelivery({ ackMode: 'after', crash: 'before-ack', idempotent: false })).toMatchObject({ effects: 2, deliveries: 2, duplicate: true, verdict: 'дубль эффекта' });
  });

  it('ack после обработки + идемпотентность: «ровно один эффект» при любом сбое', () => {
    for (const crash of crashPoints) expect(runDelivery({ ackMode: 'after', crash, idempotent: true }).verdict, crash).toBe('ok');
  });

  it('ack до обработки: падение до обработки → сообщение потеряно (at-most-once)', () => {
    expect(runDelivery({ ackMode: 'before', crash: 'before-process', idempotent: false })).toMatchObject({ effects: 0, deliveries: 1, lost: true, verdict: 'потеряно' });
  });

  it('ack до обработки: идемпотентность не спасает от потери', () => {
    expect(runDelivery({ ackMode: 'before', crash: 'before-process', idempotent: true }).lost).toBe(true);
  });

  it('ack до обработки: падение до ack безопасно (сообщение вернётся)', () => {
    expect(runDelivery({ ackMode: 'before', crash: 'before-ack', idempotent: false })).toMatchObject({ effects: 1, deliveries: 2, verdict: 'ok' });
  });

  it('инвариант: at-least-once (ack после) никогда не теряет сообщение; at-most-once никогда не даёт дубль', () => {
    for (const crash of crashPoints) for (const idempotent of [false, true]) {
      expect(runDelivery({ ackMode: 'after', crash, idempotent }).lost).toBe(false);
      expect(runDelivery({ ackMode: 'before', crash, idempotent }).duplicate).toBe(false);
    }
  });

  it('таймлайны корректны для всех комбинаций и описания сбоев непусты', () => {
    for (const ackMode of ['after', 'before'] as AckMode[]) for (const crash of crashPoints as CrashPoint[]) for (const idempotent of [false, true]) {
      const spec = deliveryTimeline({ ackMode, crash, idempotent });
      expect(validateTimeline(spec), `${ackMode} ${crash} ${idempotent}`).toEqual([]);
      expect(describeCrash(ackMode, crash).length).toBeGreaterThan(0);
    }
  });
});
