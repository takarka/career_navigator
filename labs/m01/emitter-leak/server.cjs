// Лаборатория: утечка слушателей EventEmitter.
// Сервис раздаёт события обновлений через общий эмиттер `updates`. Для каждого запроса /wait обработчик
// ждёт следующее событие 'tick'. В обработчике есть утечка слушателей.
// ЗАДАНИЕ: найди утечку и исправь так, чтобы число слушателей 'tick' не росло. Проверка: npm test
const http = require('node:http');
const EventEmitter = require('node:events');

const updates = new EventEmitter();
setInterval(() => updates.emit('tick', Date.now()), 20).unref();

const server = http.createServer((req, res) => {
  if (req.url === '/wait') {
    updates.on('tick', (t) => {
      res.end(String(t));
    });
  } else if (req.url === '/listeners') {
    res.end(String(updates.listenerCount('tick')));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));
