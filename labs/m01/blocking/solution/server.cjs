// Решение: тяжёлая работа выполняется в worker_threads, главный поток остаётся свободным.
const http = require('node:http');
const { Worker } = require('node:worker_threads');
const path = require('node:path');

function heavyInWorker() {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'heavy-worker.cjs'), { workerData: { ms: Number(process.env.SLOW_MS ?? 400) } });
    w.once('message', resolve);
    w.once('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/fast') {
    res.end('fast');
  } else if (req.url === '/slow') {
    try {
      const r = await heavyInWorker();
      res.end(`slow ${Math.round(r) % 10}`);
    } catch {
      res.statusCode = 500;
      res.end('error');
    }
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log('listening', server.address().port));
