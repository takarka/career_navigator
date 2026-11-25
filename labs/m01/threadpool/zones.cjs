// Лаборатория: что реально выполняется в thread pool.
// Запуск: node zones.cjs   (размер пула принудительно 1, добавь --json для машинного вывода)
//
// Единственный поток пула занимает долгий crypto.pbkdf2. Операции, которым нужен пул, дожидаются его завершения;
// операции в главном потоке или в асинхронном вводе-выводе ОС завершаются сразу.
process.env.UV_THREADPOOL_SIZE = '1';
if (!process.env.__ZONES_CHILD) {
  // UV_THREADPOOL_SIZE нужно задать до старта процесса: перезапускаемся с нужным окружением
  const r = require('node:child_process').spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, UV_THREADPOOL_SIZE: '1', __ZONES_CHILD: '1' },
  });
  process.exit(r.status ?? 1);
}

const crypto = require('node:crypto');
const fs = require('node:fs');
const dns = require('node:dns');
const net = require('node:net');
const zlib = require('node:zlib');
const json = process.argv.includes('--json');

const t0 = Date.now();
const times = {};
const mark = (name) => { times[name] = Date.now() - t0; };

crypto.pbkdf2('p', 's', 1500000, 64, 'sha512', () => mark('crypto.pbkdf2'));
fs.stat(__filename, () => mark('fs.stat'));
dns.lookup('localhost', () => mark('dns.lookup'));
zlib.gzip('x'.repeat(1000), () => mark('zlib.gzip'));
crypto.randomBytes(16, () => mark('crypto.randomBytes'));
setTimeout(() => mark('setTimeout'), 1);
setImmediate(() => mark('setImmediate'));

const srv = net.createServer((s) => s.end('hi')).listen(0, '127.0.0.1', () => {
  const c = net.connect(srv.address().port, '127.0.0.1');
  c.on('data', () => { mark('net.socket (по IP)'); c.end(); srv.close(); });
});

process.on('exit', () => {
  if (json) console.log(JSON.stringify(times));
  else {
    console.log('Время завершения, мс (пул занят долгим pbkdf2):');
    for (const [k, v] of Object.entries(times).sort((a, b) => a[1] - b[1])) console.log(String(v).padStart(6), k);
  }
});
