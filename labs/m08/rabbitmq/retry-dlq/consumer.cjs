// Очередь work с ретраями. ЗАДАНИЕ:
//  1) настрой топологию: work --(DLX)--> work.retry (TTL 500 мс, DLX обратно в work); итоговая очередь work.dlq;
//  2) при ошибке обработки не делай nack с requeue: отправляй сообщение в work.retry через nack без requeue;
//  3) считай попытки (заголовок x-death, который заполняет брокер) и после 3-й неудачи отправляй сообщение в work.dlq.
// Сообщение с текстом POISON всегда падает при обработке. Остальные обрабатываются успешно.
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const MAX_ATTEMPTS = 3;

async function topology(ch) {
  await ch.assertQueue('work.dlq', { durable: true });
  await ch.assertQueue('work', { durable: true }); // ← нужны аргументы DLX и очередь повторов
}

function handle(body) {
  if (body.includes('POISON')) throw new Error('не удалось обработать');
}

(async () => {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await topology(ch);
  await ch.prefetch(1);
  await ch.consume('work', (msg) => {
    const body = msg.content.toString();
    try {
      handle(body);
      console.log('OK', body);
      ch.ack(msg);
    } catch {
      console.log('FAIL', body);
      ch.nack(msg, false, true); // ← requeue: ядовитое сообщение крутится бесконечно
    }
  });
  console.log('consumer ready');
})();
