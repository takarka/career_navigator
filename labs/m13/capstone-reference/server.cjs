// Минимальный эталон КОНТРАКТА capstone: in-memory, без БД, брокера и интеграций.
// Нужен, чтобы проверить приёмочные тесты. Полноценный проект (NestJS, PostgreSQL, Outbox, брокер) пишется самостоятельно.
const http = require('node:http');
const { randomUUID } = require('node:crypto');

function createServer() {
  const apps = [];
  const byKey = new Map();
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  return http.createServer((req, res) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'applications') return send(res, 404, { error: 'not found' });
      if (req.method === 'POST' && parts.length === 1) {
        let body; try { body = JSON.parse(data || '{}'); } catch { return send(res, 400, { error: 'invalid json' }); }
        if (typeof body.title !== 'string' || !body.title) return send(res, 400, { error: 'title must be a non-empty string' });
        const key = req.headers['idempotency-key'];
        if (key && byKey.has(key)) return send(res, 200, byKey.get(key));
        const app = { id: randomUUID(), seq: apps.length + 1, title: body.title, payload: body.payload ?? null, status: 'NEW' };
        apps.push(app);
        if (key) byKey.set(key, app);
        return send(res, 201, app);
      }
      if (req.method === 'GET' && parts.length === 1) {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 100);
        const cursor = Number(Buffer.from(url.searchParams.get('cursor') ?? '', 'base64').toString() || 0);
        const rest = apps.filter((a) => a.seq > cursor);
        const items = rest.slice(0, limit);
        const nextCursor = rest.length > limit ? Buffer.from(String(items[items.length - 1].seq)).toString('base64') : null;
        return send(res, 200, { items, nextCursor });
      }
      const app = apps.find((a) => a.id === parts[1]);
      if (!app) return send(res, 404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 2) return send(res, 200, app);
      if (req.method === 'POST' && parts[2] === 'cancel') {
        if (app.status === 'CANCELLED') return send(res, 409, { error: 'already cancelled' });
        app.status = 'CANCELLED';
        return send(res, 200, app);
      }
      return send(res, 404, { error: 'not found' });
    });
  });
}

module.exports = { createServer };
if (require.main === module) createServer().listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => console.log('listening'));
