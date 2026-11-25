// Запускает настоящий redis-server на свободном порту и проверяет блокировку. Нужен redis-server в PATH.
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { connect } = require('./resp.cjs');
const { acquire, release } = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'lock.cjs') : path.join(__dirname, 'lock.cjs'));

const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = await freePort();
  const proc = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  proc.on('error', (e) => { console.log('Не удалось запустить redis-server: ' + e.message); process.exit(2); });
  let c;
  for (let i = 0; i < 50 && !c; i++) { try { c = await connect(port); } catch { await sleep(100); } }
  if (!c) { console.log('redis-server не отвечает'); proc.kill(); process.exit(2); }
  const clients = await Promise.all(Array.from({ length: 10 }, () => connect(port)));
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}: ${e.message}`]); } };

  await check('из 10 одновременных попыток блокировку получает ровно один', async () => {
    const got = await Promise.all(clients.map((cl, i) => acquire(cl, 'lock:a', `t${i}`, 5000)));
    const n = got.filter(Boolean).length;
    if (n !== 1) throw new Error(`получили блокировку ${n} клиентов`);
  });
  await check('чужой токен не снимает блокировку', async () => {
    await c.cmd('DEL', 'lock:b');
    await acquire(c, 'lock:b', 'owner', 5000);
    const r = await release(c, 'lock:b', 'stranger');
    if (r) throw new Error('release вернул true для чужого токена');
    if ((await c.cmd('GET', 'lock:b')) !== 'owner') throw new Error('блокировка была снята чужим токеном');
  });
  await check('владелец снимает блокировку, затем её можно взять снова', async () => {
    if (!(await release(c, 'lock:b', 'owner'))) throw new Error('владелец не смог снять');
    if (!(await acquire(c, 'lock:b', 'next', 5000))) throw new Error('повторное получение не удалось');
  });
  await check('блокировка истекает по TTL', async () => {
    await c.cmd('DEL', 'lock:c');
    await acquire(c, 'lock:c', 'x', 100);
    await sleep(250);
    if (!(await acquire(c, 'lock:c', 'y', 1000))) throw new Error('блокировка не истекла');
  });

  clients.forEach((x) => x.close());
  c.close();
  proc.kill();
  let failed = 0;
  for (const [ok, name] of results) { console.log(`${ok ? 'OK    ' : 'ПРОВАЛ'} ${name}`); if (!ok) failed++; }
  if (failed) { console.log(`ПРОВАЛ: не пройдено проверок: ${failed}`); process.exit(1); }
  console.log('OK');
  process.exit(0);
})();
