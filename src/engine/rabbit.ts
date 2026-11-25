/**
 * Модель RabbitMQ: маршрутизация через exchange и биндинги, очереди, consumer с prefetch, ack/nack,
 * возврат неподтверждённых сообщений при падении consumer, TTL и dead letter exchange.
 * Время виртуальное (мс). Это модель логики AMQP 0-9-1, а не сетевого протокола.
 * Проверяется инвариантами (сохранение сообщений, возврат неподтверждённых, порядок маршрутизации).
 * Оракула на реальном RabbitMQ для самой модели нет (лаборатории labs/m08/rabbitmq на живом брокере проходят): см. docs/open-questions.md.
 */
export type ExchangeType = 'direct' | 'fanout' | 'topic';

export interface Binding {
  queue: string;
  /** Ключ привязки (для direct — точное значение, для topic — шаблон с * и #; для fanout игнорируется). */
  key: string;
}

/**
 * Сопоставление ключа маршрутизации с шаблоном topic: слова разделены точками;
 * `*` — ровно одно слово, `#` — ноль или больше слов.
 */
export function topicMatches(pattern: string, routingKey: string): boolean {
  const p = pattern === '' ? [] : pattern.split('.');
  const k = routingKey === '' ? [] : routingKey.split('.');
  const memo = new Map<string, boolean>();
  const go = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let res: boolean;
    if (i === p.length) res = j === k.length;
    else if (p[i] === '#') res = go(i + 1, j) || (j < k.length && go(i, j + 1));
    else if (j === k.length) res = false;
    else res = (p[i] === '*' || p[i] === k[j]) && go(i + 1, j + 1);
    memo.set(key, res);
    return res;
  };
  return go(0, 0);
}

/** В какие очереди попадёт сообщение: по типу exchange и биндингам (каждая очередь не более одного раза). */
export function route(type: ExchangeType, bindings: Binding[], routingKey: string): string[] {
  const out: string[] = [];
  for (const b of bindings) {
    const ok = type === 'fanout' ? true : type === 'direct' ? b.key === routingKey : topicMatches(b.key, routingKey);
    if (ok && !out.includes(b.queue)) out.push(b.queue);
  }
  return out;
}

export interface QueueDef {
  name: string;
  /** TTL сообщений в очереди, мс. */
  ttl?: number;
  /** Куда отправлять «мёртвые» сообщения (через DLX с направлением напрямую в очередь). */
  deadLetterTo?: string;
  /** Максимальная длина: при переполнении самое старое сообщение «умирает» (drop-head, по умолчанию в RabbitMQ). */
  maxLength?: number;
}

export interface Message {
  id: number;
  key: string;
  /** Сколько раз сообщение «умирало» (отклонено, истёк TTL, переполнение): аналог числа записей x-death. */
  deaths: number;
  /** Сколько раз consumer уже пытался обработать сообщение и потерпел неудачу (счётчик попыток для ретраев). */
  attempts: number;
  redelivered: boolean;
  /** Время, когда сообщение истечёт в текущей очереди. */
  expireAt?: number;
  /** «Ядовитое» сообщение: обработка всегда завершается ошибкой. */
  poison: boolean;
}

export type FailMode = 'requeue' | 'dead-letter';

export interface ConsumerDef {
  id: string;
  queue: string;
  prefetch: number;
  /** Время обработки одного сообщения, мс. */
  processMs: number;
  /** Что делать при ошибке обработки: вернуть в очередь или отправить в dead letter. */
  onFail: FailMode;
  /** После стольких неудачных попыток сообщение уходит в очередь giveUpTo (parking lot / итоговая DLQ). */
  maxAttempts?: number;
  giveUpTo?: string;
}

interface InFlight {
  msg: Message;
  doneAt: number;
}

export interface Broker {
  now: number;
  queues: Record<string, { def: QueueDef; ready: Message[] }>;
  consumers: (ConsumerDef & { alive: boolean; inflight: InFlight[] })[];
  exchange: { type: ExchangeType; bindings: Binding[] };
  acked: number[];
  dropped: number[];
  nextId: number;
  log: string[];
}

export function createBroker(queues: QueueDef[], exchange: Broker['exchange']): Broker {
  return {
    now: 0,
    queues: Object.fromEntries(queues.map((q) => [q.name, { def: q, ready: [] }])),
    consumers: [],
    exchange,
    acked: [],
    dropped: [],
    nextId: 1,
    log: [],
  };
}

const clone = (b: Broker): Broker => JSON.parse(JSON.stringify(b));

function enqueue(b: Broker, queue: string, msg: Message) {
  const q = b.queues[queue];
  if (!q) {
    b.dropped.push(msg.id);
    b.log.push(`#${msg.id}: очереди ${queue} нет, сообщение потеряно`);
    return;
  }
  msg.expireAt = q.def.ttl !== undefined ? b.now + q.def.ttl : undefined;
  q.ready.push(msg);
  if (q.def.maxLength !== undefined && q.ready.length > q.def.maxLength) {
    const old = q.ready.shift()!;
    deadLetter(b, queue, old, 'maxlen');
  }
}

/** Сообщение «умирает» в очереди: уходит в dead letter очередь (если задана) или пропадает. */
function deadLetter(b: Broker, queue: string, msg: Message, reason: 'rejected' | 'expired' | 'maxlen') {
  const target = b.queues[queue]?.def.deadLetterTo;
  const why = { rejected: 'отклонено', expired: 'истёк TTL', maxlen: 'очередь переполнена' }[reason];
  if (target) {
    const next = { ...msg, deaths: msg.deaths + 1, redelivered: false };
    b.log.push(`#${msg.id}: ${why} в ${queue} → dead letter → ${target}`);
    enqueue(b, target, next);
  } else {
    b.dropped.push(msg.id);
    b.log.push(`#${msg.id}: ${why} в ${queue}, dead letter не настроен — сообщение потеряно`);
  }
}

export function addConsumer(b0: Broker, def: ConsumerDef): Broker {
  const b = clone(b0);
  b.consumers.push({ ...def, alive: true, inflight: [] });
  b.log.push(`consumer ${def.id} подключился к ${def.queue} (prefetch ${def.prefetch})`);
  return dispatch(b);
}

/** Публикация: маршрутизация по exchange, затем доставка свободным consumer. */
export function publish(b0: Broker, key: string, poison = false): Broker {
  const b = clone(b0);
  const id = b.nextId++;
  const targets = route(b.exchange.type, b.exchange.bindings, key);
  if (!targets.length) {
    b.dropped.push(id);
    b.log.push(`#${id} (ключ ${key}): ни один биндинг не подошёл, сообщение отброшено`);
    return b;
  }
  b.log.push(`#${id} (ключ ${key}) → ${targets.join(', ')}`);
  targets.forEach((t, i) => enqueue(b, t, { id: i === 0 ? id : b.nextId++, key, deaths: 0, attempts: 0, redelivered: false, poison }));
  return dispatch(b);
}

/** Падение consumer: все его неподтверждённые сообщения возвращаются в очередь (в начало) с пометкой redelivered. */
export function killConsumer(b0: Broker, id: string): Broker {
  const b = clone(b0);
  const c = b.consumers.find((x) => x.id === id);
  if (!c || !c.alive) return b;
  c.alive = false;
  const back = c.inflight.map((f) => ({ ...f.msg, redelivered: true }));
  const q = b.queues[c.queue];
  q.ready.unshift(...back);
  c.inflight = [];
  b.log.push(`consumer ${id} упал: вернулись в очередь ${c.queue} неподтверждённые: ${back.map((m) => '#' + m.id).join(' ') || 'нет'}`);
  return dispatch(b);
}

/** Раздача сообщений свободным consumer с учётом prefetch (по кругу между живыми consumer одной очереди). */
function dispatch(b: Broker): Broker {
  let progress = true;
  while (progress) {
    progress = false;
    for (const c of b.consumers) {
      if (!c.alive || c.inflight.length >= c.prefetch) continue;
      const q = b.queues[c.queue];
      const msg = q.ready.shift();
      if (!msg) continue;
      c.inflight.push({ msg, doneAt: b.now + c.processMs });
      b.log.push(`#${msg.id} → consumer ${c.id}${msg.redelivered ? ' (повторная доставка)' : ''}`);
      progress = true;
    }
  }
  return b;
}

/** Продвигает время: завершается обработка (ack или ошибка), истекают TTL, раздаются новые сообщения. */
export function advance(b0: Broker, ms: number): Broker {
  let b = clone(b0);
  const end = b.now + ms;
  for (;;) {
    const times: number[] = [];
    for (const c of b.consumers) if (c.alive) for (const f of c.inflight) times.push(f.doneAt);
    for (const q of Object.values(b.queues)) for (const m of q.ready) if (m.expireAt !== undefined) times.push(m.expireAt);
    const next = Math.min(...times.filter((t) => t >= b.now && t <= end), Infinity);
    if (next === Infinity) break;
    b.now = next;
    // истёкшие сообщения (TTL проверяется только для готовых к выдаче)
    for (const [name, q] of Object.entries(b.queues)) {
      const expired = q.ready.filter((m) => m.expireAt !== undefined && m.expireAt <= b.now);
      q.ready = q.ready.filter((m) => !(m.expireAt !== undefined && m.expireAt <= b.now));
      for (const m of expired) deadLetter(b, name, m, 'expired');
    }
    // завершение обработки
    for (const c of b.consumers) {
      if (!c.alive) continue;
      const done = c.inflight.filter((f) => f.doneAt <= b.now);
      c.inflight = c.inflight.filter((f) => f.doneAt > b.now);
      for (const f of done) {
        if (!f.msg.poison) {
          b.acked.push(f.msg.id);
          b.log.push(`consumer ${c.id}: ack #${f.msg.id}`);
        } else if (c.maxAttempts !== undefined && c.giveUpTo && f.msg.attempts + 1 >= c.maxAttempts) {
          b.log.push(`consumer ${c.id}: попытка ${f.msg.attempts + 1} из ${c.maxAttempts} неудачна — #${f.msg.id} уходит в ${c.giveUpTo}`);
          enqueue(b, c.giveUpTo, { ...f.msg, attempts: f.msg.attempts + 1, redelivered: false });
        } else if (c.onFail === 'requeue') {
          b.queues[c.queue].ready.push({ ...f.msg, attempts: f.msg.attempts + 1, redelivered: true });
          b.log.push(`consumer ${c.id}: nack #${f.msg.id} с requeue (вернулось в конец очереди)`);
        } else {
          b.log.push(`consumer ${c.id}: nack #${f.msg.id} без requeue`);
          deadLetter(b, c.queue, { ...f.msg, attempts: f.msg.attempts + 1 }, 'rejected');
        }
      }
    }
    b = dispatch(b);
  }
  b.now = end;
  return dispatch(b);
}

/** Где сейчас находится каждое известное сообщение: для проверки инварианта «ничего не теряется незаметно». */
export function census(b: Broker) {
  const ready = Object.values(b.queues).reduce((n, q) => n + q.ready.length, 0);
  const unacked = b.consumers.reduce((n, c) => n + (c.alive ? c.inflight.length : 0), 0);
  return { ready, unacked, acked: b.acked.length, dropped: b.dropped.length, total: ready + unacked + b.acked.length + b.dropped.length };
}
