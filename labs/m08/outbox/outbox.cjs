// Лаборатория: Outbox и Inbox. БД — встроенный node:sqlite (в памяти): так лабораторию можно запустить без Docker.
// Нужно реализовать три функции так, чтобы события не терялись при сбое брокера и не дублировали эффект.
// Вариант с PostgreSQL (FOR UPDATE SKIP LOCKED) описан в README. Проверка: npm test
//
// Сейчас createOrder делает «двойную запись»: сначала заказ в БД, потом publish.
// Если брокер недоступен, заказ уже сохранён, а событие потеряно навсегда.
const { DatabaseSync } = require('node:sqlite');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orders (id TEXT PRIMARY KEY, total INTEGER NOT NULL);
    CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE inbox (event_id TEXT PRIMARY KEY);
    CREATE TABLE shipments (order_id TEXT NOT NULL);
  `);
  return db;
}

// ЗАДАНИЕ 1: сохрани заказ и строку outbox ОДНОЙ транзакцией (BEGIN … COMMIT, при ошибке ROLLBACK). Не вызывай broker здесь.
function createOrder(db, broker, order) {
  db.prepare('INSERT INTO orders (id, total) VALUES (?, ?)').run(order.id, order.total);
  broker.publish({ eventId: `order-created:${order.id}`, orderId: order.id }); // ← двойная запись
}

// ЗАДАНИЕ 2: relay. Выбери неотправленные строки outbox, опубликуй каждую в брокер и ТОЛЬКО ПОСЛЕ ЭТОГО пометь sent = 1.
// Если брокер недоступен или relay упал, строки остаются неотправленными и уйдут при следующем запуске (at-least-once).
function relay(db, broker) {}

// ЗАДАНИЕ 3: consumer. Отсеки повторную доставку: запиши event_id в inbox (PRIMARY KEY) в одной транзакции с эффектом
// (создание отгрузки). Повторное событие не должно создавать вторую отгрузку.
function handleEvent(db, event) {
  db.prepare('INSERT INTO shipments (order_id) VALUES (?)').run(event.orderId);
}

module.exports = { setup, createOrder, relay, handleEvent };
