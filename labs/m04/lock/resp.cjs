// Минимальный клиент RESP2 (без зависимостей) для учебных лабораторий.
const net = require('node:net');

function parse(b, o) {
  if (o >= b.length) return null;
  const end = b.indexOf('\r\n', o);
  if (end < 0) return null;
  const t = String.fromCharCode(b[o]);
  const line = b.toString('utf8', o + 1, end);
  if (t === '+') return [line, end + 2];
  if (t === '-') return [new Error(line), end + 2];
  if (t === ':') return [Number(line), end + 2];
  if (t === '$') {
    const n = Number(line);
    if (n < 0) return [null, end + 2];
    if (b.length < end + 2 + n + 2) return null;
    return [b.toString('utf8', end + 2, end + 2 + n), end + 2 + n + 2];
  }
  if (t === '*') {
    const n = Number(line);
    const arr = [];
    let p = end + 2;
    for (let i = 0; i < n; i++) {
      const r = parse(b, p);
      if (!r) return null;
      arr.push(r[0]);
      p = r[1];
    }
    return [arr, p];
  }
  throw new Error('bad RESP');
}

function connect(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, host);
    let buf = Buffer.alloc(0);
    const waiters = [];
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const r = parse(buf, 0);
        if (!r || !waiters.length) break;
        buf = buf.subarray(r[1]);
        const w = waiters.shift();
        if (r[0] instanceof Error) w.reject(r[0]);
        else w.resolve(r[0]);
      }
    });
    sock.on('error', reject);
    sock.on('connect', () =>
      resolve({
        cmd: (...args) =>
          new Promise((res, rej) => {
            waiters.push({ resolve: res, reject: rej });
            sock.write(`*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join(''));
          }),
        close: () => sock.end(),
      }),
    );
  });
}

module.exports = { connect };
