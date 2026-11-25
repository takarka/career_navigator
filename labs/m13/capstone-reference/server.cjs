// Эталон capstone без внешних зависимостей: HTTP-контракт + SQLite (node:sqlite) + Outbox + воркер отправки
// в учебный SOAP-мок (labs/m12/soap-mock). Не NestJS и не настоящий брокер: цель — показать границы транзакции,
// идемпотентность, ретраи и обработку Fault/таймаута. Нужен Node 22+.
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');

// Минимальный сервер WebSocket (RFC 6455): только отправка текстовых кадров клиентам и закрытие по кадру close.
function wsFrame(text) {
  const payload = Buffer.from(text);
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]);
  return Buffer.concat([head, payload]);
}
const { DatabaseSync } = require('node:sqlite');
const { getStatus, SoapFault } = require('../../m12/soap-mock/solution/client.cjs');

const MAX_ATTEMPTS = 3;

function createApp({ soapUrl, retryDelayMs = 50, timeoutMs = 500, rateLimit = 0 } = {}) {
  const hits = new Map(); // окно 1 с на IP; 0 — ограничение выключено
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE application (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, title TEXT NOT NULL, payload TEXT, status TEXT NOT NULL, idem_key TEXT UNIQUE);
    CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE status_history (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL);
  `);
  const sockets = new Set();
  const row = (r) => r && { id: r.id, title: r.title, payload: r.payload ? JSON.parse(r.payload) : null, status: r.status };
  const setStatus = (id, status) => {
    db.prepare('UPDATE application SET status = ? WHERE id = ?').run(status, id);
    db.prepare('INSERT INTO status_history (app_id, status, at) VALUES (?, ?, ?)').run(id, status, Date.now());
    const msg = wsFrame(JSON.stringify({ event: 'application.status', id, status }));
    for (const sock of sockets) sock.write(msg);
  };

  function createApplication(body, key) {
    if (key) {
      const ex = db.prepare('SELECT * FROM application WHERE idem_key = ?').get(key);
      if (ex) return { created: false, app: row(ex) };
    }
    const id = randomUUID();
    db.exec('BEGIN');
    try { // заявка и запись outbox — одна транзакция
      db.prepare('INSERT INTO application (id, title, payload, status, idem_key) VALUES (?, ?, ?, ?, ?)').run(id, body.title, body.payload ? JSON.stringify(body.payload) : null, 'NEW', key ?? null);
      db.prepare('INSERT INTO outbox (app_id, next_at) VALUES (?, ?)').run(id, Date.now());
      db.prepare('INSERT INTO status_history (app_id, status, at) VALUES (?, ?, ?)').run(id, 'NEW', Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { created: true, app: row(db.prepare('SELECT * FROM application WHERE id = ?').get(id)) };
  }

  let busy = false;
  async function tick() {
    if (busy || !soapUrl) return;
    busy = true;
    try {
      const job = db.prepare('SELECT * FROM outbox WHERE done = 0 AND next_at <= ? ORDER BY id LIMIT 1').get(Date.now());
      if (!job) return;
      const app = db.prepare('SELECT * FROM application WHERE id = ?').get(job.app_id);
      if (app.status === 'CANCELLED') { db.prepare('UPDATE outbox SET done = 1 WHERE id = ?').run(job.id); return; }
      const requestId = (app.payload && JSON.parse(app.payload).requestId) ?? 42;
      try {
        const r = await getStatus(soapUrl, String(requestId), timeoutMs);
        setStatus(app.id, r.status === 'accepted' ? 'ACCEPTED' : 'SUBMITTED');
        db.prepare('UPDATE outbox SET done = 1 WHERE id = ?').run(job.id);
      } catch (e) {
        if (e instanceof SoapFault) { // отказ внешней системы повтором не лечится
          setStatus(app.id, 'REJECTED');
          db.prepare('UPDATE outbox SET done = 1 WHERE id = ?').run(job.id);
        } else if (job.attempts + 1 >= MAX_ATTEMPTS) {
          setStatus(app.id, 'FAILED');
          db.prepare('UPDATE outbox SET done = 1, attempts = attempts + 1 WHERE id = ?').run(job.id);
        } else {
          db.prepare('UPDATE outbox SET attempts = attempts + 1, next_at = ? WHERE id = ?').run(Date.now() + retryDelayMs * 2 ** job.attempts, job.id);
        }
      }
    } finally { busy = false; }
  }
  const timer = setInterval(() => { tick(); }, 20);
  timer.unref();

  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => {
      if (rateLimit > 0) {
        const sec = Math.floor(Date.now() / 1000);
        const ip = req.socket.remoteAddress;
        const h = hits.get(ip);
        const n = h && h.sec === sec ? h.n + 1 : 1;
        hits.set(ip, { sec, n });
        if (n > rateLimit) { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' }); return res.end('{"error":"too many requests"}'); }
      }
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'applications') return send(res, 404, { error: 'not found' });
      if (req.method === 'POST' && parts.length === 1) {
        let body; try { body = JSON.parse(data || '{}'); } catch { return send(res, 400, { error: 'invalid json' }); }
        if (typeof body.title !== 'string' || !body.title) return send(res, 400, { error: 'title must be a non-empty string' });
        const r = createApplication(body, req.headers['idempotency-key']);
        return send(res, r.created ? 201 : 200, r.app);
      }
      if (req.method === 'GET' && parts.length === 1) {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 100);
        const cursor = Number(Buffer.from(url.searchParams.get('cursor') ?? '', 'base64').toString() || 0);
        const rows = db.prepare('SELECT * FROM application WHERE seq > ? ORDER BY seq LIMIT ?').all(cursor, limit + 1);
        const items = rows.slice(0, limit);
        const nextCursor = rows.length > limit ? Buffer.from(String(items[items.length - 1].seq)).toString('base64') : null;
        return send(res, 200, { items: items.map(row), nextCursor });
      }
      const app = db.prepare('SELECT * FROM application WHERE id = ?').get(parts[1] ?? '');
      if (!app) return send(res, 404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 2) return send(res, 200, row(app));
      if (req.method === 'POST' && parts[2] === 'cancel') {
        if (app.status === 'CANCELLED') return send(res, 409, { error: 'already cancelled' });
        setStatus(app.id, 'CANCELLED');
        return send(res, 200, row(db.prepare('SELECT * FROM application WHERE id = ?').get(app.id)));
      }
      return send(res, 404, { error: 'not found' });
    });
  });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (new URL(req.url, 'http://x').pathname !== '/ws' || !key) return socket.destroy();
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on('data', (d) => { if ((d[0] & 0x0f) === 0x8) socket.end(Buffer.from([0x88, 0])); }); // close
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });
  return { server, db, close: () => { clearInterval(timer); for (const x of sockets) x.destroy(); db.close(); } };
}

module.exports = { createApp, createServer: () => createApp().server };
if (require.main === module) {
  const app = createApp({ soapUrl: process.env.SOAP_URL, rateLimit: Number(process.env.RATE_LIMIT ?? 0) });
  app.server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('listening'));
  // graceful shutdown: перестаём принимать соединения, ждём текущие запросы, выходим с кодом 0
  process.on('SIGTERM', () => { app.server.close(() => { app.close(); process.exit(0); }); app.server.closeIdleConnections(); });
}
