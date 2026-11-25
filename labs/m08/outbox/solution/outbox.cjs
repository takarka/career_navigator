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

function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Заказ и событие записываются атомарно. О брокере сервис в этот момент не знает.
function createOrder(db, broker, order) {
  tx(db, () => {
    db.prepare('INSERT INTO orders (id, total) VALUES (?, ?)').run(order.id, order.total);
    const event = { eventId: `order-created:${order.id}`, orderId: order.id };
    db.prepare('INSERT INTO outbox (event_id, payload) VALUES (?, ?)').run(event.eventId, JSON.stringify(event));
  });
}

// Relay: публикуем, затем помечаем. Падение между этими шагами даёт повторную публикацию, а не потерю.
// В PostgreSQL выборку делают с FOR UPDATE SKIP LOCKED, чтобы несколько relay не брали одни и те же строки.
function relay(db, broker) {
  const rows = db.prepare('SELECT id, payload FROM outbox WHERE sent = 0 ORDER BY id').all();
  for (const row of rows) {
    broker.publish(JSON.parse(row.payload)); // может бросить исключение: строка останется неотправленной
    db.prepare('UPDATE outbox SET sent = 1 WHERE id = ?').run(row.id);
  }
}

// Inbox: запись event_id и эффект — одной транзакцией. Повтор нарушает PRIMARY KEY и пропускается.
function handleEvent(db, event) {
  const seen = db.prepare('SELECT 1 FROM inbox WHERE event_id = ?').get(event.eventId);
  if (seen) return;
  tx(db, () => {
    db.prepare('INSERT INTO inbox (event_id) VALUES (?)').run(event.eventId);
    db.prepare('INSERT INTO shipments (order_id) VALUES (?)').run(event.orderId);
  });
}

module.exports = { setup, createOrder, relay, handleEvent };
