// Лаборатория: graceful shutdown.
// /slow отвечает через 300 мс (имитация долгого запроса). Сейчас при SIGTERM процесс умирает мгновенно и обрывает запрос.
// ЗАДАНИЕ: обработай SIGTERM (и SIGINT): перестань принимать новые соединения, дождись текущих запросов,
// закрой ресурсы и выйди с кодом 0. Добавь принудительное завершение по таймауту. Проверка: npm test
const http = require('node:http');

const server = http.createServer((req, res) => {
  if (req.url === '/slow') setTimeout(() => res.end('done'), 300);
  else res.end('ok');
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));
