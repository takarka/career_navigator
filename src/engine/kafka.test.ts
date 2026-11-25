import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { addConsumer, assignPartitions, commit, createCluster, lag, murmur2, partitionForKey, poll, produce, removeConsumer, seek, usefulConsumers, type Cluster } from './kafka.ts';

const require_ = createRequire(import.meta.url);

describe('murmur2 и партиционер: сверка с kafkajs (офлайн-оракул)', () => {
  const kafkajsMurmur2 = require_('kafkajs/src/producer/partitioners/default/murmur2.js') as (k: string) => number;
  const keys = ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'user-1', 'user-42', 'order:2026-11-25:7', '21', 'foobar', 'a-little-bit-long-string', 'ключ-кириллица', '😀 emoji'];

  it('murmur2 совпадает с kafkajs на разных ключах', () => {
    for (const k of keys) expect(murmur2(k), k).toBe(kafkajsMurmur2(k));
  });

  it('совпадает с эталонными значениями из тестов Java-клиента Kafka', () => {
    // из UtilsTest.testMurmur2 в apache/kafka
    expect(murmur2('21')).toBe(-973932308);
    expect(murmur2('foobar')).toBe(-790332482);
    expect(murmur2('a-little-bit-long-string')).toBe(-985981536);
  });

  it('партиция по ключу совпадает с DefaultPartitioner kafkajs', () => {
    const { Partitioners } = require_('kafkajs') as { Partitioners: { DefaultPartitioner: () => (a: unknown) => number } };
    const part = Partitioners.DefaultPartitioner();
    for (const n of [1, 3, 6, 12])
      for (const k of keys) {
        const meta = Array.from({ length: n }, (_, i) => ({ partitionId: i, leader: 0 }));
        expect(partitionForKey(k, n), `${k} / ${n}`).toBe(part({ topic: 't', partitionMetadata: meta, message: { key: k } }));
      }
  });

  it('один ключ всегда в одной партиции', () => {
    for (let i = 0; i < 50; i++) expect(partitionForKey('same', 6)).toBe(partitionForKey('same', 6));
  });
});

describe('назначение партиций', () => {
  it('round-robin совпадает с RoundRobinAssigner kafkajs', async () => {
    const assigner = require_('kafkajs/src/consumer/assigners/roundRobinAssigner/index.js') as (a: unknown) => { assign: (a: unknown) => Promise<{ memberId: string; memberAssignment: Buffer }[]> };
    const { MemberAssignment } = require_('kafkajs/src/consumer/assignerProtocol') as { MemberAssignment: { decode: (b: Buffer) => { assignment: Record<string, number[]> } } };
    for (const [members, partitions] of [[['b', 'a', 'c'], 7], [['m1', 'm2'], 5], [['x'], 4], [['a', 'b', 'c', 'd'], 2]] as [string[], number][]) {
      const cluster = { findTopicPartitionMetadata: () => Array.from({ length: partitions }, (_, i) => ({ partitionId: i })) };
      const res = await assigner({ cluster }).assign({ members: members.map((memberId) => ({ memberId })), topics: ['t'] });
      const real: Record<string, number[]> = {};
      for (const r of res) real[r.memberId] = MemberAssignment.decode(r.memberAssignment)!.assignment['t'];
      const model = assignPartitions(members, partitions, 'roundRobin');
      for (const m of members) expect(model[m] ?? [], `${members} ${partitions} ${m}`).toEqual(real[m] ?? []);
    }
  });

  it('range: подряд идущие диапазоны, остаток достаётся первым', () => {
    expect(assignPartitions(['c1', 'c2', 'c3'], 7, 'range')).toEqual({ c1: [0, 1, 2], c2: [3, 4], c3: [5, 6] });
  });

  it('каждая партиция ровно у одного участника; лишние consumer простаивают', () => {
    for (const strategy of ['roundRobin', 'range'] as const) {
      const a = assignPartitions(['a', 'b', 'c', 'd', 'e'], 3, strategy);
      const all = Object.values(a).flat().sort();
      expect(all).toEqual([0, 1, 2]);
      expect(Object.values(a).filter((x) => x.length === 0)).toHaveLength(2);
    }
  });
});

const drain = (c: Cluster, steps = 30): Cluster => {
  for (let i = 0; i < steps; i++) c = poll(c);
  return c;
};

describe('кластер: инварианты', () => {
  const keys = ['u1', 'u2', 'u3', 'u1', 'u2', 'u1', 'u4', 'u3'];
  const fill = (c: Cluster) => keys.reduce((acc, k) => produce(acc, k), c);

  it('порядок сообщений одного ключа сохраняется при потреблении', () => {
    let c = addConsumer(addConsumer(createCluster(3)));
    c = drain(fill(c));
    const seen = c.consumers.flatMap((x) => x.processed);
    expect(seen).toHaveLength(keys.length);
    // сообщения одного ключа лежат в одной партиции, значит и читаются одним consumer по порядку
    for (const k of new Set(keys)) {
      const valuesByCons = c.consumers.map((x) => x.processed.filter((s) => s.endsWith(`(${k})`)));
      expect(valuesByCons.filter((v) => v.length).length).toBe(1);
      const nums = valuesByCons.flat().map((s) => Number(/m(\d+)/.exec(s)![1]));
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
    }
  });

  it('число полезных consumer не больше числа партиций', () => {
    let c = createCluster(3);
    for (let i = 0; i < 5; i++) c = addConsumer(c);
    expect(c.consumers).toHaveLength(5);
    expect(usefulConsumers(c)).toBe(3);
  });

  it('падение consumer до коммита приводит к повторной обработке (at-least-once)', () => {
    let c = addConsumer(createCluster(1));
    c = fill(c);
    c = drain(c, 3); // обработано 3, коммита не было
    const before = c.consumers[0].processed.slice();
    expect(before).toHaveLength(3);
    c = removeConsumer(c, 'c1');
    c = addConsumer(c); // новый consumer читает с закоммиченного offset (0)
    c = drain(c, 20);
    const after = c.consumers[0].processed;
    expect(after).toHaveLength(keys.length); // перечитал всё с начала
    expect(after.slice(0, 3)).toEqual(before); // первые три обработаны повторно
  });

  it('коммит после обработки: при падении повторно читается только необработанное', () => {
    let c = fill(addConsumer(createCluster(1)));
    c = commit(drain(c, 3));
    c = removeConsumer(c, 'c1');
    c = addConsumer(c);
    c = drain(c, 20);
    expect(c.consumers[0].processed).toHaveLength(keys.length - 3);
  });

  it('lag считается от закоммиченного offset; seek перематывает (replay)', () => {
    let c = fill(addConsumer(createCluster(1)));
    expect(lag(c)).toEqual([keys.length]);
    c = commit(drain(c, keys.length));
    expect(lag(c)).toEqual([0]);
    c = seek(c, 0, 2);
    expect(lag(c)).toEqual([keys.length - 2]);
    c = drain(c, 20);
    expect(c.consumers[0].processed.length).toBe(keys.length + keys.length - 2);
  });

  it('rebalance при добавлении consumer перераспределяет партиции без дублей', () => {
    let c = addConsumer(createCluster(4));
    expect(c.consumers[0].assigned).toEqual([0, 1, 2, 3]);
    c = addConsumer(c);
    const all = c.consumers.flatMap((x) => x.assigned).sort();
    expect(all).toEqual([0, 1, 2, 3]);
    expect(c.consumers.every((x) => x.assigned.length === 2)).toBe(true);
  });
});
