import type { EventKind, TimelineSpec } from './timeline.ts';

/**
 * Инжектор сбоев для гарантий доставки: одно сообщение, один consumer, запись эффекта в БД.
 * Порядок шагов зависит от режима подтверждения:
 *   ack после обработки (at-least-once): получить → обработать (запись в БД) → ack
 *   ack до обработки (at-most-once):     получить → ack → обработать (запись в БД)
 * Сбой — падение consumer перед выбранным шагом при первой доставке; после рестарта брокер повторно отдаёт
 * неподтверждённое сообщение, и вторая попытка проходит без сбоев.
 */
export type AckMode = 'after' | 'before';
export type CrashPoint = 'none' | 'before-process' | 'before-ack';

export interface DeliveryConfig {
  ackMode: AckMode;
  crash: CrashPoint;
  /** Идемпотентный обработчик: запись в таблицу processed_messages с UNIQUE в той же транзакции, что и эффект. */
  idempotent: boolean;
}

export interface DeliveryOutcome {
  /** Сколько раз эффект реально применился к БД. */
  effects: number;
  /** Сколько раз сообщение было доставлено consumer. */
  deliveries: number;
  lost: boolean;
  duplicate: boolean;
  verdict: 'ok' | 'потеряно' | 'дубль эффекта';
}

type Step = 'process' | 'ack';
const orderOf = (mode: AckMode): Step[] => (mode === 'after' ? ['process', 'ack'] : ['ack', 'process']);

export const crashPoints: CrashPoint[] = ['none', 'before-process', 'before-ack'];

export function describeCrash(mode: AckMode, p: CrashPoint): string {
  if (p === 'none') return 'без сбоев';
  const order = orderOf(mode);
  const idx = order.indexOf(p === 'before-process' ? 'process' : 'ack');
  const prev = idx === 0 ? 'получения' : order[idx - 1] === 'process' ? 'обработки' : 'подтверждения';
  return `падение после ${prev}, до ${p === 'before-process' ? 'обработки' : 'ack'}`;
}

export function runDelivery(cfg: DeliveryConfig): DeliveryOutcome {
  let effects = 0;
  let deliveries = 0;
  let acked = false;
  const applied = new Set<string>(); // таблица processed_messages
  const apply = () => {
    if (cfg.idempotent && applied.has('m1')) return; // повтор отсечён уникальным ключом
    applied.add('m1');
    effects++;
  };

  for (let attempt = 0; ; attempt++) {
    deliveries++;
    let crashed = false;
    for (const step of orderOf(cfg.ackMode)) {
      if (attempt === 0 && cfg.crash === `before-${step}`) {
        crashed = true;
        break; // процесс упал перед этим шагом
      }
      if (step === 'process') apply();
      else acked = true;
    }
    if (!crashed) break;
    if (acked) break; // подтверждённое сообщение брокер повторно не отдаёт
  }
  const lost = effects === 0;
  const duplicate = effects > 1;
  return { effects, deliveries, lost, duplicate, verdict: lost ? 'потеряно' : duplicate ? 'дубль эффекта' : 'ok' };
}

/** Таймлайн сценария для компонента Timeline. */
export function deliveryTimeline(cfg: DeliveryConfig): TimelineSpec {
  const lanes = [
    { id: 'broker', title: 'Брокер' },
    { id: 'consumer', title: 'Consumer' },
    { id: 'db', title: 'База данных' },
  ];
  const events: TimelineSpec['events'] = [];
  const steps: TimelineSpec['steps'] = [];
  let t = 0;
  const add = (lane: string, label: string, kind: EventKind, title: string, text: string) => {
    events.push({ id: `e${events.length}`, lane, at: t++, label, kind, step: steps.length });
    steps.push({ title, text });
  };
  const doStep = (step: Step, second: boolean) => {
    if (step === 'process') {
      const dupSkipped = second && cfg.idempotent;
      const dup = second && !cfg.idempotent;
      add('db', dupSkipped ? 'повтор отсечён' : dup ? 'эффект дважды' : 'запись эффекта', dup ? 'bad' : 'ok', dupSkipped ? 'Идемпотентность' : 'Обработка', dupSkipped ? 'Запись с тем же message_id уже есть: UNIQUE не пускает повтор, эффект не удваивается.' : dup ? 'Эффект применён второй раз: дубль.' : 'Consumer применил эффект в БД.');
    } else add('broker', 'ack', 'ok', 'Подтверждение', 'Consumer подтвердил сообщение: брокер его больше не отдаст.');
  };

  const order = orderOf(cfg.ackMode);
  add('broker', 'сообщение m1', 'info', 'Доставка', 'Брокер отдаёт сообщение consumer.');
  let ackedBeforeCrash = false;
  let processedBeforeCrash = false;
  let crashed = false;
  for (const step of order) {
    if (cfg.crash === `before-${step}`) {
      add('consumer', 'сбой', 'bad', 'Сбой', `Процесс упал ${describeCrash(cfg.ackMode, cfg.crash).replace('падение ', '')}.`);
      crashed = true;
      break;
    }
    if (step === 'ack') ackedBeforeCrash = true;
    else processedBeforeCrash = true;
    doStep(step, false);
  }
  if (crashed) {
    if (ackedBeforeCrash) {
      add('broker', 'не вернётся', 'bad', 'Потеря', 'Сообщение уже подтверждено, брокер его не повторит. Эффект в БД так и не появился.');
    } else {
      add('broker', 'повтор m1', 'wait', 'Повторная доставка', 'Сообщение не было подтверждено: после рестарта брокер отдаёт его снова.');
      for (const step of order) doStep(step, step === 'process' && processedBeforeCrash);
    }
  }
  return { lanes, events, arrows: [], steps };
}
