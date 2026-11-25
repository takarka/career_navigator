// Автотест: «ядовитое» сообщение после 3 попыток попадает в work.dlq, обычные обрабатываются.
// Нужен запущенный RabbitMQ. Код выхода 2 — брокер недоступен (тест пропущен).
// Запуск: npm test (твой consumer.cjs) или npm test -- solution
const { spawn } = require('node:child_process');
const path = require('node:path');
const amqp = require('amqplib');

const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const target = process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'consumer.cjs') : path.join(__dirname, 'consumer.cjs');
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
  for (const q of ['work', 'work.retry', 'work.dlq']) await ch.deleteQueue(q);

  const lines = [];
  const child = spawn(process.execPath, [target], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', (d) => lines.push(...String(d).split('\n').filter(Boolean)));
  await new Promise((resolve) => { const t = setInterval(() => lines.some((l) => l.includes('consumer ready')) && (clearInterval(t), resolve()), 50); });

  for (const body of ['ok-1', 'POISON-1', 'ok-2']) ch.sendToQueue('work', Buffer.from(body), { persistent: true });

  let dlq = 0;
  for (let i = 0; i < 100 && dlq < 1; i++) {
    await sleep(150);
    dlq = (await ch.checkQueue('work.dlq')).messageCount;
  }
  child.kill();
  const okCount = lines.filter((l) => l.startsWith('OK ok-')).length;
  const fails = lines.filter((l) => l.startsWith('FAIL POISON')).length;
  console.log(`в work.dlq сообщений: ${dlq}; обработано обычных: ${okCount}; неудачных попыток ядовитого: ${fails}`);
  for (const q of ['work', 'work.retry', 'work.dlq']) await ch.deleteQueue(q).catch(() => {});
  await conn.close();

  const problems = [];
  if (dlq !== 1) problems.push('ядовитое сообщение должно оказаться в work.dlq ровно один раз');
  if (okCount !== 2) problems.push('два обычных сообщения должны быть обработаны');
  if (fails !== 3) problems.push('ядовитое сообщение должно быть обработано с ошибкой ровно 3 раза, а не бесконечно');
  if (problems.length) {
    problems.forEach((p) => console.log('ПРОВАЛ: ' + p));
    process.exit(1);
  }
  console.log('OK');
})();
