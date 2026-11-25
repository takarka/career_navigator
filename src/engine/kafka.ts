/**
 * Модель Kafka: topic с партициями, продюсер с ключом, consumer group с rebalance, offsets, lag, replay.
 * Это модель логики, а не сетевого протокола: нет репликации, лидеров и таймингов.
 * Проверяется инвариантами (порядок в партиции, один consumer на партицию в группе, повторная доставка
 * после падения до коммита) и сверкой murmur2 и round-robin назначения с реализацией kafkajs (офлайн).
 */

/** murmur2 из Java-клиента Kafka (0.10.2+), как в kafkajs: возвращает знаковое 32-битное число. */
export function murmur2(key: string | Uint8Array): number {
  const data = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const length = data.length;
  const M = 0x5bd1e995;
  const R = 24;
  let h = (0x9747b28c ^ length) | 0;
  const length4 = length >> 2;
  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k = (data[i4] & 0xff) | ((data[i4 + 1] & 0xff) << 8) | ((data[i4 + 2] & 0xff) << 16) | ((data[i4 + 3] & 0xff) << 24);
    k = Math.imul(k, M);
    k ^= k >>> R;
    k = Math.imul(k, M);
    h = Math.imul(h, M);
    h ^= k;
  }
  const tail = length & ~3;
  const rem = length % 4;
  if (rem === 3) h ^= (data[tail + 2] & 0xff) << 16;
  if (rem >= 2) h ^= (data[tail + 1] & 0xff) << 8;
  if (rem >= 1) {
    h ^= data[tail] & 0xff;
    h = Math.imul(h, M);
  }
  h ^= h >>> 13;
  h = Math.imul(h, M);
  h ^= h >>> 15;
  return h | 0;
}

/** Партиция для ключа: toPositive(murmur2(key)) % N — как в стандартном партиционере Java-клиента и kafkajs. */
export function partitionForKey(key: string, partitions: number): number {
  return (murmur2(key) & 0x7fffffff) % partitions;
}

export type Strategy = 'roundRobin' | 'range';

/** Назначение партиций (0..P-1) участникам группы. Возвращает memberId → партиции. */
export function assignPartitions(members: string[], partitions: number, strategy: Strategy): Record<string, number[]> {
  const sorted = [...members].sort();
  const out: Record<string, number[]> = Object.fromEntries(sorted.map((m) => [m, [] as number[]]));
  if (!sorted.length) return out;
  if (strategy === 'roundRobin') {
    for (let p = 0; p < partitions; p++) out[sorted[p % sorted.length]].push(p);
  } else {
    // Range: подряд идущие диапазоны; первые (P mod C) участников получают на одну партицию больше
    const per = Math.floor(partitions / sorted.length);
    const extra = partitions % sorted.length;
    let next = 0;
    sorted.forEach((m, i) => {
      const n = per + (i < extra ? 1 : 0);
      for (let k = 0; k < n; k++) out[m].push(next++);
    });
  }
  return out;
}

export interface Msg {
  offset: number;
  key: string;
  value: string;
}

export interface Consumer {
  id: string;
  /** Партиции, назначенные при последнем rebalance. */
  assigned: number[];
  /** Позиция чтения (следующий offset) по партициям. */
  position: Record<number, number>;
  /** Журнал обработанных сообщений в порядке обработки. */
  processed: string[];
  /** С какой из назначенных партиций начинать следующий опрос (круговой обход). */
  cursor: number;
}

export interface Cluster {
  partitions: number;
  strategy: Strategy;
  log: Msg[][];
  /** Закоммиченные offsets группы: следующий offset, с которого начнётся чтение после rebalance/рестарта. */
  committed: Record<number, number>;
  consumers: Consumer[];
  /** Пауза обработки во время rebalance (eager). */
  rebalancing: boolean;
  events: string[];
  counter: number;
}

export function createCluster(partitions: number, strategy: Strategy = 'roundRobin'): Cluster {
  return { partitions, strategy, log: Array.from({ length: partitions }, () => []), committed: {}, consumers: [], rebalancing: false, events: [], counter: 0 };
}

const clone = (c: Cluster): Cluster => JSON.parse(JSON.stringify(c));
const note = (c: Cluster, text: string) => void c.events.push(text);

/** Отправка сообщения: партиция определяется ключом. */
export function produce(c0: Cluster, key: string): Cluster {
  const c = clone(c0);
  const p = partitionForKey(key, c.partitions);
  const offset = c.log[p].length;
  c.counter++;
  const value = `m${c.counter}`;
  c.log[p].push({ offset, key, value });
  note(c, `продюсер: ${value} (ключ ${key}) → партиция ${p}, offset ${offset}`);
  return c;
}

/** Rebalance: назначение пересчитывается, позиция каждого consumer = закоммиченный offset партиции. */
function rebalance(c: Cluster, reason: string) {
  const assignment = assignPartitions(c.consumers.map((x) => x.id), c.partitions, c.strategy);
  for (const cons of c.consumers) {
    cons.assigned = assignment[cons.id] ?? [];
    cons.position = Object.fromEntries(cons.assigned.map((p) => [p, c.committed[p] ?? 0]));
    cons.cursor = 0;
  }
  c.rebalancing = false;
  note(c, `rebalance (${reason}): ${c.consumers.map((x) => `${x.id}=[${x.assigned.join(',')}]`).join(' ') || 'нет consumer'}`);
}

export function addConsumer(c0: Cluster): Cluster {
  const c = clone(c0);
  const id = `c${c.consumers.length ? Math.max(...c.consumers.map((x) => Number(x.id.slice(1)))) + 1 : 1}`;
  c.consumers.push({ id, assigned: [], position: {}, processed: [], cursor: 0 });
  rebalance(c, `вошёл ${id}`);
  return c;
}

/** Consumer ушёл (упал или остановлен): всё, что он прочитал, но не закоммитил, будет прочитано заново. */
export function removeConsumer(c0: Cluster, id: string): Cluster {
  const c = clone(c0);
  c.consumers = c.consumers.filter((x) => x.id !== id);
  rebalance(c, `вышел ${id}`);
  return c;
}

/** Каждый consumer читает и обрабатывает по одному сообщению из своих партиций (по кругу). */
export function poll(c0: Cluster): Cluster {
  const c = clone(c0);
  for (const cons of c.consumers) {
    const n = cons.assigned.length;
    for (let k = 0; k < n; k++) {
      const idx = (cons.cursor + k) % n;
      const p = cons.assigned[idx];
      const pos = cons.position[p] ?? 0;
      const m = c.log[p][pos];
      if (m) {
        cons.position[p] = pos + 1;
        cons.cursor = (idx + 1) % n;
        cons.processed.push(`${m.value}(${m.key})`);
        note(c, `${cons.id}: обработал ${m.value} из партиции ${p}, offset ${m.offset}`);
        break; // одно сообщение за шаг на consumer
      }
    }
  }
  return c;
}

/** Коммит: закоммиченный offset каждой назначенной партиции = текущая позиция чтения. */
export function commit(c0: Cluster): Cluster {
  const c = clone(c0);
  for (const cons of c.consumers) for (const p of cons.assigned) c.committed[p] = Math.max(c.committed[p] ?? 0, cons.position[p] ?? 0);
  note(c, `коммит: ${Object.entries(c.committed).map(([p, o]) => `p${p}=${o}`).join(' ')}`);
  return c;
}

/** Replay: перемотать закоммиченный offset партиции назад и перечитать. */
export function seek(c0: Cluster, partition: number, offset: number): Cluster {
  const c = clone(c0);
  c.committed[partition] = Math.max(0, Math.min(offset, c.log[partition].length));
  for (const cons of c.consumers) if (cons.assigned.includes(partition)) cons.position[partition] = c.committed[partition];
  note(c, `seek: партиция ${partition} → offset ${c.committed[partition]}`);
  return c;
}

/** Lag партиции: сколько сообщений в журнале после закоммиченного offset. */
export function lag(c: Cluster): number[] {
  return c.log.map((l, p) => l.length - (c.committed[p] ?? 0));
}

export function usefulConsumers(c: Cluster): number {
  return c.consumers.filter((x) => x.assigned.length > 0).length;
}
