// Проверка кода модуля 6 на настоящих class-validator, ConfigModule и TypeORM (PostgreSQL: DATABASE_URL, по умолчанию labs/docker-compose.yml).
// ConfigModule.forRoot({ validate }) выполняется при загрузке модуля (когда вычисляется декоратор @Module), поэтому переменные задаём до require.
if (process.argv[2] === 'noenv') delete process.env.DATABASE_URL;
else process.env.DATABASE_URL ??= 'postgres://lab:lab@localhost:5432/lab';
const url = process.env.DATABASE_URL;
let appModule;
try { appModule = require('./dist/app.js'); } catch (e) { console.log('NOENV-OK: ' + e.message); process.exit(process.argv[2] === 'noenv' && /DATABASE_URL/.test(e.message) ? 0 : 1); }
if (process.argv[2] === 'noenv') {
  // без обязательной переменной приложение не должно стартовать: validateEnv бросает ошибку (при создании приложения)
  appModule.createApp().then(() => { console.log('NOENV-FAIL: приложение стартовало без DATABASE_URL'); process.exit(1); }, (e) => { console.log('NOENV-OK: ' + e.message); process.exit(/DATABASE_URL/.test(e.message) ? 0 : 1); });
  return;
}
const { createApp } = appModule;
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}: ${e.message}`]); } };
const post = async (base, body) => { const r = await fetch(base + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };

(async () => {
  const app = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${new URL(await app.getUrl()).port}`;
  await check('верные данные: 201, dto — экземпляр класса, вложенный элемент — экземпляр, числа приведены', async () => {
    const r = await post(base, { customerId: 5, items: [{ sku: 'a', qty: 2 }] });
    if (r.status !== 201) throw new Error(`статус ${r.status} ${JSON.stringify(r.json)}`);
    if (!r.json.isInstance || !r.json.itemIsInstance || r.json.customerIdType !== 'number') throw new Error(JSON.stringify(r.json));
  });
  await check('невалидные данные: 400 со списком нарушенных правил', async () => {
    const r = await post(base, { customerId: 0, items: [] });
    if (r.status !== 400 || !Array.isArray(r.json.message) || r.json.message.length < 2) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
  });
  await check('forbidNonWhitelisted: лишнее поле даёт 400', async () => {
    const r = await post(base, { customerId: 1, items: [{ sku: 'a', qty: 1 }], hack: true });
    if (r.status !== 400 || !JSON.stringify(r.json.message).includes('should not exist')) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
  });
  await check('вложенная валидация (ValidateNested + Type): qty=0 в элементе даёт 400', async () => {
    const r = await post(base, { customerId: 1, items: [{ sku: 'a', qty: 0 }] });
    if (r.status !== 400) throw new Error(`${r.status} ${JSON.stringify(r.json)}`);
  });
  await check('TypeOrmModule.forRootAsync подключается к PostgreSQL', async () => {
    const { DataSource } = require('typeorm');
    const ds = app.get(DataSource);
    const rows = await ds.query('select 1 as one');
    if (rows[0].one !== 1) throw new Error('select 1 не вернул 1');
  });
  await app.close();
  await check('ConfigModule validate: без DATABASE_URL приложение не стартует с понятной ошибкой', async () => {
    const r = require('node:child_process').spawnSync(process.execPath, [__filename, 'noenv'], { encoding: 'utf8' });
    if (!/NOENV-OK: DATABASE_URL/.test(r.stdout)) throw new Error(r.stdout + r.stderr);
  });
  let bad = 0;
  for (const [ok, n] of results) { console.log(`${ok ? 'OK    ' : 'ПРОВАЛ'} ${n}`); if (!ok) bad++; }
  console.log(bad ? `ПРОВАЛ: ${bad}` : 'OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('Ошибка запуска: ' + e.message); process.exit(2); });
