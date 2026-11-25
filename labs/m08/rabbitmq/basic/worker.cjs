// Consumer очереди lab.tasks. ЗАДАНИЕ: сделай обработку надёжной — подтверждай сообщения вручную (ack) ПОСЛЕ обработки
// и ограничь prefetch. Сейчас сообщения подтверждаются автоматически (noAck: true): если consumer упадёт, сообщение пропадёт.
// Переменная окружения HANG=1 — consumer получает сообщение и «зависает» (не обрабатывает), чтобы тест мог его убить.
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const QUEUE = 'lab.tasks';

(async () => {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.consume(
    QUEUE,
    (msg) => {
      console.log('received', msg.content.toString());
      if (process.env.HANG === '1') return; // ничего не делаем и не подтверждаем
      console.log('processed', msg.content.toString());
    },
    { noAck: true }, // ← автоподтверждение
  );
  console.log('worker ready');
})();
