// Автотест: сообщение, которое consumer получил, но не подтвердил, должно вернуться в очередь после его гибели.
// Нужен запущенный RabbitMQ (docker compose up -d --wait rabbitmq в папке labs). Код выхода 2 — брокер недоступен (тест пропущен).
// Запуск: npm test            (проверяет worker.cjs)
//         npm test -- solution (проверяет эталон)
const { spawn } = require('node:child_process');
const path = require('node:path');
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const QUEUE = 'lab.tasks';
const worker = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'worker.cjs') : path.join(__dirname, 'worker.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let conn;
  try {
    conn = await amqp.connect(url);
  } catch (e) {
    console.log(`RabbitMQ недоступен (${url}): ${e.message}\nПоднимите брокер: cd labs && docker compose up -d --wait rabbitmq`);
    process.exit(2);
  }
  const ch = await conn.createChannel();
  await ch.deleteQueue(QUEUE);
  await ch.assertQueue(QUEUE, { durable: true });
  ch.sendToQueue(QUEUE, Buffer.from('job-1'), { persistent: true });

  const child = spawn(process.execPath, [worker], { env: { ...process.env, HANG: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => child.stdout.on('data', (d) => String(d).includes('received job-1') && resolve()));
  child.kill('SIGKILL'); // consumer погиб до ack
  await sleep(1000); // брокер замечает закрытие соединения

  const got = await ch.get(QUEUE, { noAck: false });
  let failed = false;
  if (!got) {
    console.log('ПРОВАЛ: после гибели consumer сообщения в очереди нет. Скорее всего оно было подтверждено автоматически (noAck: true): включи ручной ack.');
    failed = true;
  } else {
    console.log(`сообщение вернулось в очередь: ${got.content.toString()}, redelivered=${got.fields.redelivered}`);
    if (!got.fields.redelivered) {
      console.log('ПРОВАЛ: ожидался признак redelivered');
      failed = true;
    }
    ch.ack(got);
  }
  await ch.deleteQueue(QUEUE);
  await conn.close();
  if (failed) process.exit(1);
  console.log('OK');
})();
