// Лаборатория: блокировка event loop.
// /fast отвечает сразу. /slow имитирует CPU-ёмкую работу (занятый цикл на SLOW_MS мс) и блокирует главный поток.
// ЗАДАНИЕ: перепиши обработчик /slow так, чтобы /fast не замедлялся (подсказка: worker_threads).
// Проверка: npm test
const http = require('node:http');

const SLOW_MS = Number(process.env.SLOW_MS ?? 400);

function heavy() {
  const end = Date.now() + SLOW_MS;
  let x = 0;
  while (Date.now() < end) x += Math.sqrt(x + 1); // занятый цикл: настоящая нагрузка на CPU
  return x;
}

const server = http.createServer((req, res) => {
  if (req.url === '/fast') {
    res.end('fast');
  } else if (req.url === '/slow') {
    const r = heavy(); // ← блокирует event loop
    res.end(`slow ${Math.round(r) % 10}`);
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));
