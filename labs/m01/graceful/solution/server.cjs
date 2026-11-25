// Решение: graceful shutdown.
const http = require('node:http');

const server = http.createServer((req, res) => {
  if (req.url === '/slow') setTimeout(() => res.end('done'), 300);
  else res.end('ok');
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return; // повторный сигнал не запускает остановку заново
  shuttingDown = true;
  console.log(`получен ${signal}: останавливаюсь`);

  // страховка: если что-то зависло, выходим принудительно с ненулевым кодом
  const force = setTimeout(() => {
    console.error('таймаут graceful shutdown, принудительный выход');
    process.exit(1);
  }, 5000);
  force.unref();

  // 1) не принимаем новые соединения; колбэк вызовется, когда завершатся текущие
  server.close(async (err) => {
    // 2) здесь закрываются остальные ресурсы: пул БД, брокер, кэш (в обратном порядке создания)
    process.exit(err ? 1 : 0);
  });
  // 3) соединения keep-alive без активного запроса закрываем сразу, чтобы они не задерживали остановку
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
