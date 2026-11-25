// Решение: work → (nack без requeue, DLX) → work.retry (TTL) → (DLX) → work; после MAX_ATTEMPTS — work.dlq.
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

async function topology(ch) {
  await ch.assertQueue('work.dlq', { durable: true });
  await ch.assertQueue('work.retry', {
    durable: true,
    arguments: { 'x-message-ttl': RETRY_DELAY_MS, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'work' },
  });
  await ch.assertQueue('work', {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'work.retry' },
  });
}

// Сколько раз сообщение уже отклонялось из очереди work: брокер ведёт счётчик в заголовке x-death.
function rejectedCount(msg) {
  const deaths = msg.properties.headers?.['x-death'] ?? [];
  return deaths.find((d) => d.queue === 'work' && d.reason === 'rejected')?.count ?? 0;
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
      const attempt = Number(rejectedCount(msg)) + 1;
      console.log('FAIL', body, `попытка ${attempt}`);
      if (attempt >= MAX_ATTEMPTS) {
        ch.sendToQueue('work.dlq', msg.content, { persistent: true, headers: { 'x-attempts': attempt } });
        ch.ack(msg);
      } else {
        ch.nack(msg, false, false); // без requeue: брокер отправит в work.retry через DLX
      }
    }
  });
  console.log('consumer ready');
})();
