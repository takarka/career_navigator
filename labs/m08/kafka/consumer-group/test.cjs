// Автотест: порядок по ключу и rebalance. Нужен запущенный Kafka (cd labs && docker compose up -d --wait kafka).
// Код выхода 2 — брокер недоступен (тест пропущен). Запуск: npm test (твой message.cjs) или npm test -- solution
const path = require('node:path');
const { Kafka, logLevel } = require('kafkajs');

const { toKafkaMessage } = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'message.cjs') : path.join(__dirname, 'message.cjs'));
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const topic = `lab-orders-${Date.now()}`;
const group = `lab-group-${Date.now()}`;
const kafka = new Kafka({ clientId: 'lab', brokers, logLevel: logLevel.NOTHING, retry: { retries: 3, initialRetryTime: 200 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (cond, ms, what) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(100); }
  console.log(`таймаут ожидания: ${what}`);
  return false;
};

(async () => {
  const admin = kafka.admin();
  try {
    await admin.connect();
  } catch (e) {
    console.log(`Kafka недоступна (${brokers}): ${e.message}\nПоднимите брокер: cd labs && docker compose up -d --wait kafka`);
    process.exit(2);
  }
  await admin.createTopics({ waitForLeaders: true, topics: [{ topic, numPartitions: 4 }] });

  // пользователей 3, а партиций 4: иначе круговая раздача без ключа случайно совпала бы с раскладкой по пользователям
  const users = ['u1', 'u2', 'u3'];
  const events = Array.from({ length: 40 }, (_, i) => ({ userId: users[i % 3], seq: Math.floor(i / 3) }));
  const producer = kafka.producer();
  await producer.connect();
  // отправляем по одному, чтобы порядок отправки был определён
  for (const e of events) await producer.send({ topic, messages: [toKafkaMessage(e)] });

  const received = []; // { consumer, partition, offset, userId, seq }
  const make = async (name) => {
    const c = kafka.consumer({ groupId: group });
    await c.connect();
    await c.subscribe({ topic, fromBeginning: true });
    await c.run({ eachMessage: async ({ partition, message }) => { const v = JSON.parse(message.value.toString()); received.push({ consumer: name, partition, offset: Number(message.offset), ...v }); } });
    return c;
  };
  const c1 = await make('c1');
  const c2 = await make('c2');
  const gotAll = await waitFor(() => received.length >= events.length, 20000, 'чтение 40 сообщений');

  const problems = [];
  if (!gotAll) problems.push('не удалось прочитать все сообщения');
  for (const u of users) {
    const mine = received.filter((m) => m.userId === u);
    const parts = new Set(mine.map((m) => m.partition));
    if (parts.size !== 1) problems.push(`события ${u} попали в ${parts.size} партиций (${[...parts].join(', ')}): без ключа порядок для пользователя не гарантирован`);
    else {
      const bySeq = [...mine].sort((a, b) => a.offset - b.offset).map((m) => m.seq);
      if (bySeq.join() !== [...bySeq].sort((a, b) => a - b).join()) problems.push(`порядок событий ${u} нарушен`);
    }
  }
  const used = new Set(received.map((m) => m.consumer));
  console.log(`прочитано ${received.length} сообщений; consumers получили данные: ${[...used].join(', ')}`);

  // rebalance: останавливаем c2, после этого c1 должен получить сообщения из всех партиций
  await c2.disconnect();
  const before = received.length;
  for (let i = 0; i < 20; i++) await producer.send({ topic, messages: [toKafkaMessage({ userId: users[i % 3], seq: 100 + i })] });
  const afterAll = await waitFor(() => received.length >= before + 20, 30000, 'чтение после rebalance');
  const lateParts = new Set(received.slice(before).filter((m) => m.consumer === 'c1').map((m) => m.partition));
  console.log(`после ухода c2 consumer c1 читает партиции: ${[...lateParts].sort().join(', ')}`);
  if (!afterAll) problems.push('после ухода c2 оставшийся consumer не получил новые сообщения');

  await c1.disconnect();
  await producer.disconnect();
  await admin.deleteTopics({ topics: [topic] }).catch(() => {});
  await admin.disconnect();

  if (problems.length) {
    problems.forEach((p) => console.log('ПРОВАЛ: ' + p));
    process.exit(1);
  }
  console.log('OK');
})();
