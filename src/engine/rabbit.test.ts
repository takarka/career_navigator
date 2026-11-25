import { describe, expect, it } from 'vitest';
import { addConsumer, advance, census, createBroker, killConsumer, publish, route, topicMatches, type Broker } from './rabbit.ts';

describe('маршрутизация topic (примеры из руководства RabbitMQ)', () => {
  it('* — ровно одно слово', () => {
    expect(topicMatches('*.orange.*', 'quick.orange.rabbit')).toBe(true);
    expect(topicMatches('*.orange.*', 'lazy.orange.elephant')).toBe(true);
    expect(topicMatches('*.orange.*', 'quick.orange.male.rabbit')).toBe(false);
    expect(topicMatches('*.orange.*', 'orange')).toBe(false);
  });
  it('# — ноль или больше слов', () => {
    expect(topicMatches('lazy.#', 'lazy')).toBe(true);
    expect(topicMatches('lazy.#', 'lazy.pink.rabbit')).toBe(true);
    expect(topicMatches('lazy.#', 'quick.lazy')).toBe(false);
    expect(topicMatches('#', 'any.key.here')).toBe(true);
    expect(topicMatches('a.#.b', 'a.b')).toBe(true);
    expect(topicMatches('a.#.b', 'a.x.y.b')).toBe(true);
    expect(topicMatches('a.#.b', 'a.x.y')).toBe(false);
  });
  it('точное совпадение без шаблонов', () => {
    expect(topicMatches('order.created', 'order.created')).toBe(true);
    expect(topicMatches('order.created', 'order.updated')).toBe(false);
  });
});

describe('route', () => {
  const bindings = [{ queue: 'q1', key: 'error' }, { queue: 'q2', key: 'info' }, { queue: 'q3', key: 'error' }, { queue: 'q2', key: 'error' }];
  it('direct — точное совпадение, без дублей очередей', () => expect(route('direct', bindings, 'error')).toEqual(['q1', 'q3', 'q2']));
  it('fanout игнорирует ключ', () => expect(route('fanout', bindings, 'whatever')).toEqual(['q1', 'q2', 'q3']));
  it('topic', () => expect(route('topic', [{ queue: 'a', key: '*.error' }, { queue: 'b', key: 'app.#' }], 'app.error')).toEqual(['a', 'b']));
  it('нет подходящего биндинга — пустой список', () => expect(route('direct', bindings, 'debug')).toEqual([]));
});

const base = (extra: Partial<Parameters<typeof createBroker>[0][number]> = {}): Broker => createBroker([{ name: 'work', ...extra }], { type: 'direct', bindings: [{ queue: 'work', key: 'k' }] });

describe('очередь, ack и возврат', () => {
  it('сообщение без consumer ждёт в очереди', () => {
    const b = publish(base(), 'k');
    expect(census(b)).toMatchObject({ ready: 1, unacked: 0, acked: 0 });
  });

  it('после ack сообщение удаляется', () => {
    let b = addConsumer(base(), { id: 'c1', queue: 'work', prefetch: 1, processMs: 100, onFail: 'requeue' });
    b = advance(publish(b, 'k'), 50);
    expect(census(b)).toMatchObject({ unacked: 1, acked: 0 });
    b = advance(b, 60);
    expect(census(b)).toMatchObject({ unacked: 0, acked: 1, ready: 0 });
  });

  it('падение consumer до ack возвращает сообщение в очередь с redelivered', () => {
    let b = addConsumer(base(), { id: 'c1', queue: 'work', prefetch: 1, processMs: 1000, onFail: 'requeue' });
    b = publish(b, 'k');
    b = advance(b, 10);
    b = killConsumer(b, 'c1');
    expect(census(b)).toMatchObject({ ready: 1, unacked: 0, acked: 0 });
    expect(b.queues['work'].ready[0].redelivered).toBe(true);
    b = addConsumer(b, { id: 'c2', queue: 'work', prefetch: 1, processMs: 10, onFail: 'requeue' });
    b = advance(b, 20);
    expect(census(b)).toMatchObject({ acked: 1, ready: 0 });
  });

  it('prefetch ограничивает число неподтверждённых сообщений на consumer', () => {
    let b = addConsumer(base(), { id: 'c1', queue: 'work', prefetch: 2, processMs: 1000, onFail: 'requeue' });
    for (let i = 0; i < 5; i++) b = publish(b, 'k');
    expect(census(b)).toMatchObject({ unacked: 2, ready: 3 });
  });

  it('при prefetch=1 два consumer делят работу, быстрый обрабатывает больше', () => {
    let b = base();
    b = addConsumer(b, { id: 'slow', queue: 'work', prefetch: 1, processMs: 100, onFail: 'requeue' });
    b = addConsumer(b, { id: 'fast', queue: 'work', prefetch: 1, processMs: 10, onFail: 'requeue' });
    for (let i = 0; i < 20; i++) b = publish(b, 'k');
    b = advance(b, 500);
    const byConsumer = (id: string) => b.log.filter((l) => l.startsWith(`consumer ${id}: ack`)).length;
    expect(byConsumer('fast')).toBeGreaterThan(byConsumer('slow'));
    expect(census(b).acked).toBe(20);
  });

  it('инвариант сохранения: сумма сообщений по состояниям равна числу опубликованных', () => {
    let b = addConsumer(base({ maxLength: 3 }), { id: 'c1', queue: 'work', prefetch: 1, processMs: 1000, onFail: 'requeue' });
    for (let i = 0; i < 10; i++) b = publish(b, 'k');
    b = killConsumer(advance(b, 100), 'c1');
    expect(census(b).total).toBe(10);
  });

  it('сообщение с неподходящим ключом отбрасывается и это видно в журнале', () => {
    const b = publish(base(), 'other');
    expect(census(b)).toMatchObject({ dropped: 1, ready: 0 });
    expect(b.log.at(-1)).toContain('ни один биндинг');
  });
});

describe('TTL, DLX и ретраи', () => {
  const topology = () =>
    createBroker(
      [{ name: 'work', deadLetterTo: 'retry' }, { name: 'retry', ttl: 1000, deadLetterTo: 'work' }, { name: 'dlq' }],
      { type: 'direct', bindings: [{ queue: 'work', key: 'k' }] },
    );

  it('сообщение без consumer истекает по TTL и уходит в dead letter очередь', () => {
    let b = createBroker([{ name: 'work', ttl: 500, deadLetterTo: 'dlq' }, { name: 'dlq' }], { type: 'direct', bindings: [{ queue: 'work', key: 'k' }] });
    b = advance(publish(b, 'k'), 600);
    expect(b.queues['work'].ready).toHaveLength(0);
    expect(b.queues['dlq'].ready).toHaveLength(1);
    expect(b.queues['dlq'].ready[0].deaths).toBe(1);
  });

  it('TTL без dead letter просто теряет сообщение и это фиксируется', () => {
    let b = createBroker([{ name: 'work', ttl: 500 }], { type: 'direct', bindings: [{ queue: 'work', key: 'k' }] });
    b = advance(publish(b, 'k'), 600);
    expect(census(b)).toMatchObject({ ready: 0, dropped: 1 });
  });

  it('ретрай с задержкой: ошибка → retry (TTL) → снова в work; обычные сообщения не мешают', () => {
    let b = addConsumer(topology(), { id: 'c', queue: 'work', prefetch: 1, processMs: 10, onFail: 'dead-letter' });
    b = publish(publish(b, 'k', true), 'k', false);
    b = advance(b, 50);
    expect(census(b).acked).toBe(1); // нормальное обработано
    expect(b.queues['retry'].ready).toHaveLength(1); // ядовитое ждёт повтора
    b = advance(b, 1000);
    expect(b.log.filter((l) => l.includes('nack')).length).toBeGreaterThanOrEqual(2); // вернулось и снова упало
  });

  it('после N попыток ядовитое сообщение попадает в итоговую очередь, а не крутится вечно', () => {
    let b = addConsumer(topology(), { id: 'c', queue: 'work', prefetch: 1, processMs: 10, onFail: 'dead-letter', maxAttempts: 3, giveUpTo: 'dlq' });
    b = publish(b, 'k', true);
    b = advance(b, 10000);
    expect(b.queues['dlq'].ready).toHaveLength(1);
    expect(b.queues['work'].ready).toHaveLength(0);
    expect(b.queues['retry'].ready).toHaveLength(0);
    expect(b.log.filter((l) => l.includes('nack')).length).toBe(2); // 2 возврата, 3-я попытка — в dlq
  });

  it('requeue без задержки: ядовитое сообщение «бьёт» по очереди бесконечно (антипаттерн)', () => {
    let b = addConsumer(base(), { id: 'c', queue: 'work', prefetch: 1, processMs: 10, onFail: 'requeue' });
    b = publish(b, 'k', true);
    b = advance(b, 1000);
    expect(b.log.filter((l) => l.includes('nack')).length).toBeGreaterThan(50);
    expect(census(b).acked).toBe(0);
  });
});
