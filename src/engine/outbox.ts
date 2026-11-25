import type { EventKind, TimelineSpec } from './timeline.ts';

/**
 * Проблема двойной записи и Outbox. Сервис должен изменить БД и сообщить об этом брокеру.
 *  - dual-db-first: COMMIT в БД, затем publish. Сбой между ними: данные изменились, событие потеряно.
 *  - dual-publish-first: publish, затем COMMIT. Сбой между ними: событие ушло, а данные не изменились (призрачное событие).
 *  - outbox: данные и строка outbox пишутся одной транзакцией; relay публикует и помечает отправленным.
 *    Сбой relay между publish и пометкой даёт повторную публикацию (дубль), который отсекает Inbox получателя.
 */
export type Mode = 'dual-db-first' | 'dual-publish-first' | 'outbox';
export type Crash = 'none' | 'between';

export interface OutboxConfig {
  mode: Mode;
  crash: Crash;
  inbox: boolean;
}

export interface OutboxOutcome {
  dbChanged: boolean;
  published: number;
  /** Сколько раз событие повлияло на получателя. */
  consumerEffects: number;
  verdict: 'ok' | 'событие потеряно' | 'призрачное событие' | 'дубль у получателя';
}

export function runOutbox(cfg: OutboxConfig): OutboxOutcome {
  let dbChanged = false;
  let published = 0;
  const crash = cfg.crash === 'between';
  if (cfg.mode === 'dual-db-first') {
    dbChanged = true;
    if (!crash) published = 1;
  } else if (cfg.mode === 'dual-publish-first') {
    published = 1;
    if (!crash) dbChanged = true;
  } else {
    dbChanged = true; // данные и outbox — одна транзакция
    published = crash ? 2 : 1; // relay упал после publish до пометки: после рестарта публикует снова
  }
  const seen = new Set<number>();
  let consumerEffects = 0;
  for (let i = 0; i < published; i++) {
    const id = 1; // одно и то же событие
    if (cfg.inbox && seen.has(id)) continue;
    seen.add(id);
    consumerEffects++;
  }
  const verdict = dbChanged && published === 0 ? 'событие потеряно' : !dbChanged && published > 0 ? 'призрачное событие' : consumerEffects > 1 ? 'дубль у получателя' : 'ok';
  return { dbChanged, published, consumerEffects, verdict };
}

export function outboxTimeline(cfg: OutboxConfig): TimelineSpec {
  const lanes = [
    { id: 'svc', title: 'Сервис и БД' },
    { id: 'relay', title: 'Relay' },
    { id: 'broker', title: 'Брокер' },
    { id: 'cons', title: 'Получатель' },
  ];
  const events: TimelineSpec['events'] = [];
  const steps: TimelineSpec['steps'] = [];
  let t = 0;
  const add = (lane: string, label: string, kind: EventKind, title: string, text: string) => {
    events.push({ id: `e${events.length}`, lane, at: t++, label, kind, step: steps.length });
    steps.push({ title, text });
  };
  const crash = cfg.crash === 'between';
  const consume = (second: boolean) =>
    second && cfg.inbox
      ? add('cons', 'дубль отсечён (Inbox)', 'ok', 'Inbox', 'Получатель уже обрабатывал это событие: запись в inbox с тем же id не проходит, эффект не удваивается.')
      : add('cons', second ? 'эффект дважды' : 'обработал', second ? 'bad' : 'ok', 'Получатель', second ? 'Событие пришло повторно, и эффект применён второй раз.' : 'Получатель обработал событие.');

  if (cfg.mode === 'dual-db-first') {
    add('svc', 'COMMIT', 'ok', 'Запись в БД', 'Сервис зафиксировал изменение данных.');
    if (crash) add('svc', 'сбой', 'bad', 'Сбой до publish', 'Процесс упал до отправки в брокер. Данные изменены, событие не отправлено и не будет: потеряно.');
    else {
      add('broker', 'событие', 'ok', 'Публикация', 'Сервис опубликовал событие.');
      consume(false);
    }
  } else if (cfg.mode === 'dual-publish-first') {
    add('broker', 'событие', 'ok', 'Публикация', 'Сервис опубликовал событие до фиксации данных.');
    consume(false);
    if (crash) add('svc', 'сбой, ROLLBACK', 'bad', 'Сбой до COMMIT', 'Процесс упал до COMMIT: данные не изменились, а получатель уже обработал событие (призрачное событие).');
    else add('svc', 'COMMIT', 'ok', 'Запись в БД', 'Сервис зафиксировал данные.');
  } else {
    add('svc', 'COMMIT: данные + outbox', 'ok', 'Одна транзакция', 'Данные и строка в таблице outbox фиксируются атомарно: либо оба, либо ничего.');
    add('relay', 'читает outbox', 'info', 'Relay читает', 'Отдельный процесс (relay) выбирает неотправленные строки, например FOR UPDATE SKIP LOCKED.');
    add('broker', 'событие', 'ok', 'Публикация', 'Relay публикует событие в брокер.');
    consume(false);
    if (crash) {
      add('relay', 'сбой до пометки', 'bad', 'Сбой relay', 'Relay упал после публикации, но до пометки строки отправленной.');
      add('relay', 'читает снова', 'wait', 'Повтор', 'После рестарта строка всё ещё не отправлена: relay публикует событие повторно (at-least-once).');
      add('broker', 'событие (повтор)', 'wait', 'Публикация повторно', 'В брокер ушёл дубль события.');
      consume(true);
    } else add('relay', 'пометка: отправлено', 'ok', 'Пометка', 'Relay пометил строку отправленной.');
  }
  return { lanes, events, arrows: [], steps };
}
