// Приёмочные тесты HTTP-контракта capstone. Работают против ЛЮБОГО решения:
//   BASE_URL=http://127.0.0.1:3000 node test.cjs
// Проверяются только контракт и идемпотентность; БД, брокер и интеграция проверяются своими тестами проекта.
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
let n = 0;
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}: ${e.message}`]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const call = async (method, path, body, headers = {}) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, json };
};
const create = (body, key) => call('POST', '/applications', body, key ? { 'Idempotency-Key': key } : {});
const uid = () => `k${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 8)}`;

(async () => {
  await check('POST /applications создаёт заявку (201) со статусом и id', async () => {
    const r = await create({ title: 'Заявка', payload: { a: 1 } }, uid());
    assert(r.status === 201, `статус ${r.status}`);
    assert(r.json && typeof r.json.id === 'string' && r.json.id, 'нет id');
    assert(typeof r.json.status === 'string', 'нет status');
  });
  await check('повтор с тем же Idempotency-Key возвращает ту же заявку и не создаёт новую', async () => {
    const key = uid();
    const a = await create({ title: 'Дубль' }, key);
    const b = await create({ title: 'Дубль' }, key);
    assert(a.status === 201, `первый ${a.status}`);
    assert([200, 201].includes(b.status), `второй ${b.status}`);
    assert(a.json.id === b.json.id, 'id различаются: создан дубль');
  });
  await check('параллельные запросы с одним ключом создают одну заявку', async () => {
    const key = uid();
    const rs = await Promise.all(Array.from({ length: 8 }, () => create({ title: 'Гонка' }, key)));
    const ids = new Set(rs.map((r) => r.json && r.json.id));
    assert(ids.size === 1, `разных заявок: ${ids.size}`);
  });
  await check('невалидное тело даёт 400', async () => {
    const r = await create({ title: 123 }, uid());
    assert(r.status === 400, `статус ${r.status}`);
  });
  await check('GET /applications/:id возвращает заявку, неизвестный id даёт 404', async () => {
    const c = await create({ title: 'Чтение' }, uid());
    const g = await call('GET', `/applications/${c.json.id}`);
    assert(g.status === 200 && g.json.id === c.json.id, `GET ${g.status}`);
    const nf = await call('GET', '/applications/does-not-exist');
    assert(nf.status === 404, `404 ожидался, получено ${nf.status}`);
  });
  await check('GET /applications?limit=2 использует курсор и не повторяет элементы', async () => {
    for (let i = 0; i < 5; i++) await create({ title: `Список ${i}` }, uid());
    const p1 = await call('GET', '/applications?limit=2');
    assert(p1.status === 200 && Array.isArray(p1.json.items) && p1.json.items.length === 2, 'первая страница не из 2 элементов');
    assert(p1.json.nextCursor, 'нет nextCursor');
    const p2 = await call('GET', `/applications?limit=2&cursor=${encodeURIComponent(p1.json.nextCursor)}`);
    assert(p2.status === 200 && p2.json.items.length >= 1, 'вторая страница пуста');
    const ids1 = new Set(p1.json.items.map((x) => x.id));
    assert(p2.json.items.every((x) => !ids1.has(x.id)), 'элементы повторяются между страницами');
  });
  await check('POST /applications/:id/cancel отменяет заявку, повторная отмена не ломает', async () => {
    const c = await create({ title: 'Отмена' }, uid());
    const r1 = await call('POST', `/applications/${c.json.id}/cancel`);
    assert(r1.status === 200, `отмена ${r1.status}`);
    const g = await call('GET', `/applications/${c.json.id}`);
    assert(g.json.status === 'CANCELLED', `статус ${g.json.status}`);
    const r2 = await call('POST', `/applications/${c.json.id}/cancel`);
    assert([200, 409].includes(r2.status), `повторная отмена ${r2.status}`);
  });

  let failed = 0;
  for (const [ok, name] of results) { console.log(`${ok ? 'OK    ' : 'ПРОВАЛ'} ${name}`); if (!ok) failed++; }
  if (failed) { console.log(`ПРОВАЛ: не пройдено проверок: ${failed} из ${results.length}`); process.exit(1); }
  console.log(`OK (${results.length} проверок)`);
})().catch((e) => { console.log('Не удалось выполнить запросы: ' + e.message); process.exit(2); });
