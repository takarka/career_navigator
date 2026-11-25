// Решение: ручное подтверждение после обработки и prefetch = 1.
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const QUEUE = 'lab.tasks';

(async () => {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.prefetch(1); // не более одного неподтверждённого сообщения
  await ch.consume(
    QUEUE,
    (msg) => {
      console.log('received', msg.content.toString());
      if (process.env.HANG === '1') return; // «зависли» до ack: брокер вернёт сообщение при закрытии соединения
      console.log('processed', msg.content.toString());
      ch.ack(msg); // подтверждаем ПОСЛЕ обработки
    },
    { noAck: false },
  );
  console.log('worker ready');
})();
