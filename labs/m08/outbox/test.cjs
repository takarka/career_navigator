// Автотест Outbox/Inbox. Запуск: npm test (твой outbox.cjs) или npm run test:solution.
const path = require('node:path');
const mod = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'outbox.cjs') : path.join(__dirname, 'outbox.cjs'));

class Broker {
  constructor() { this.down = false; this.messages = []; this.crashAfterPublish = false; }
  publish(event) {
    if (this.down) throw new Error('брокер недоступен');
    this.messages.push(event);
    if (this.crashAfterPublish) { this.crashAfterPublish = false; const e = new Error('relay упал после publish'); e.crash = true; throw e; }
  }
}
const tryRun = (fn) => { try { fn(); } catch { /* сбой допустим: проверяем итоговое состояние */ } };
const count = (db, sql, ...a) => db.prepare(sql).get(...a).c;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// 1. брокер недоступен при создании заказа: событие не должно потеряться
{
  const db = mod.setup(); const broker = new Broker();
  broker.down = true;
  tryRun(() => mod.createOrder(db, broker, { id: 'o1', total: 10 }));
  broker.down = false;
  tryRun(() => mod.relay(db, broker));
  check('событие переживает недоступность брокера', broker.messages.filter((m) => m.orderId === 'o1').length >= 1, `опубликовано: ${broker.messages.length}`);
}
// 2. атомарность: при ошибке записи нет «висящей» строки outbox
{
  const db = mod.setup(); const broker = new Broker();
  tryRun(() => mod.createOrder(db, broker, { id: 'o2', total: 10 }));
  tryRun(() => mod.createOrder(db, broker, { id: 'o2', total: 10 })); // дубль первичного ключа: транзакция должна откатиться целиком
  const outboxRows = (() => { try { return count(db, 'SELECT COUNT(*) AS c FROM outbox'); } catch { return -1; } })();
  check('заказ и событие записываются атомарно (ровно одна строка outbox на один заказ)', count(db, 'SELECT COUNT(*) AS c FROM orders') === 1 && outboxRows === 1, `orders=${count(db, 'SELECT COUNT(*) AS c FROM orders')}, outbox=${outboxRows}`);
}
// 3. relay упал после publish до пометки: дубль публикации, но эффект один (Inbox)
{
  const db = mod.setup(); const broker = new Broker();
  tryRun(() => mod.createOrder(db, broker, { id: 'o3', total: 10 }));
  broker.crashAfterPublish = true;
  tryRun(() => mod.relay(db, broker)); // упал после publish
  tryRun(() => mod.relay(db, broker)); // рестарт: публикует повторно
  check('после сбоя relay событие опубликовано повторно, а не потеряно', broker.messages.length >= 2, `сообщений в брокере: ${broker.messages.length}`);
  for (const m of broker.messages) tryRun(() => mod.handleEvent(db, m));
  check('Inbox: повторная доставка не создаёт вторую отгрузку', count(db, "SELECT COUNT(*) AS c FROM shipments WHERE order_id = 'o3'") === 1, `отгрузок: ${count(db, "SELECT COUNT(*) AS c FROM shipments WHERE order_id = 'o3'")}`);
}
// 4. успешный путь: relay помечает отправленное и не публикует второй раз
{
  const db = mod.setup(); const broker = new Broker();
  tryRun(() => mod.createOrder(db, broker, { id: 'o4', total: 10 }));
  tryRun(() => mod.relay(db, broker));
  tryRun(() => mod.relay(db, broker));
  check('relay не публикует уже отправленное повторно', broker.messages.filter((m) => m.orderId === 'o4').length === 1, `публикаций: ${broker.messages.filter((m) => m.orderId === 'o4').length}`);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'OK    ' : 'ПРОВАЛ'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
  if (!r.ok) failed++;
}
if (failed) { console.log(`ПРОВАЛ: не пройдено проверок: ${failed}`); process.exit(1); }
console.log('OK');
