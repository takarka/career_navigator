// Автотест клиента против заглушки. Запуск: npm test (твой client.cjs) или npm test -- solution.
const path = require('node:path');
const { start } = require('./mock.cjs');
const { getStatus, SoapFault } = require(process.argv[2] === 'solution' ? path.join(__dirname, 'solution', 'client.cjs') : path.join(__dirname, 'client.cjs'));

(async () => {
  const server = await start(0);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push([true, name]); } catch (e) { results.push([false, `${name}: ${e.message}`]); }
  };
  await check('успешный ответ возвращает { status }', async () => {
    const r = await getStatus(url, '42');
    if (!r || r.status !== 'accepted') throw new Error(`получено ${JSON.stringify(r)}`);
  });
  await check('SOAP Fault превращается в SoapFault с faultstring', async () => {
    try { await getStatus(url, '0'); } catch (e) {
      if (!(e instanceof SoapFault) || e.faultstring !== 'Неверный requestId') throw new Error(`другая ошибка: ${e.message}`);
      return;
    }
    throw new Error('Fault не вызвал исключения');
  });
  await check('таймаут при медленном ответе', async () => {
    try { await getStatus(url, 'slow', 300); } catch (e) {
      if (e.message !== 'timeout') throw new Error(`ожидалась ошибка timeout, получено: ${e.message}`);
      return;
    }
    throw new Error('таймаут не сработал');
  });
  server.closeAllConnections();
  server.close();
  let failed = 0;
  for (const [ok, name] of results) { console.log(`${ok ? 'OK    ' : 'ПРОВАЛ'} ${name}`); if (!ok) failed++; }
  if (failed) { console.log(`ПРОВАЛ: не пройдено проверок: ${failed}`); process.exit(1); }
  console.log('OK');
})();
