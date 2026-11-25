// Нагрузочный прогон HTTP-контракта capstone: POST /applications с уникальным Idempotency-Key.
// Против запущенного решения: BASE_URL=http://127.0.0.1:3000 node run.cjs
// Без BASE_URL поднимает эталон capstone-reference (SQLite) на свободном порту. Параметры: DURATION (с, по умолчанию 5), CONNECTIONS (по умолчанию 20).
const autocannon = require('autocannon');
const { createApp } = require('../capstone-reference/server.cjs');

const duration = Number(process.env.DURATION ?? 5);
const connections = Number(process.env.CONNECTIONS ?? 20);

(async () => {
  let app, url = process.env.BASE_URL;
  if (!url) {
    app = createApp();
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${app.server.address().port}`;
  }
  let n = 0;
  const result = await autocannon({
    url: url + '/applications', method: 'POST', duration, connections,
    headers: { 'content-type': 'application/json' },
    requests: [{ setupRequest: (req) => ({ ...req, headers: { ...req.headers, 'idempotency-key': `lt-${process.pid}-${++n}` }, body: JSON.stringify({ title: `load ${n}`, payload: { n } }) }) }],
  });
  if (app) { app.server.close(); app.close(); }
  const ok = result['2xx'], total = result.requests.total;
  console.log(`запросов: ${total}, 2xx: ${ok}, ошибок: ${result.errors}, не-2xx: ${result.non2xx}, таймаутов: ${result.timeouts}`);
  console.log(`RPS (среднее): ${result.requests.average}, задержка p50: ${result.latency.p50} мс, p99: ${result.latency.p99} мс, максимум: ${result.latency.max} мс`);
  const problems = [];
  if (result.errors || result.non2xx || result.timeouts) problems.push('есть ошибки, не-2xx или таймауты');
  if (result.latency.p99 > 1000) problems.push(`p99 ${result.latency.p99} мс выше 1000 мс`);
  if (problems.length) { console.log('ПРОВАЛ: ' + problems.join('; ')); process.exit(1); }
  console.log('OK');
  process.exit(0);
})().catch((e) => { console.log('Ошибка запуска: ' + e.message); process.exit(2); });
