// Решение: once вместо on — слушатель снимается после первого события.
// Дополнительно снимаем слушатель, если клиент отключился до события.
const http = require('node:http');
const EventEmitter = require('node:events');

const updates = new EventEmitter();
setInterval(() => updates.emit('tick', Date.now()), 20).unref();

const server = http.createServer((req, res) => {
  if (req.url === '/wait') {
    const onTick = (t) => res.end(String(t));
    updates.once('tick', onTick);
    res.on('close', () => updates.off('tick', onTick));
  } else if (req.url === '/listeners') {
    res.end(String(updates.listenerCount('tick')));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));
