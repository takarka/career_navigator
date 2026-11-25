// Заглушка SOAP 1.1 сервиса (учебная, не имитирует конкретную государственную систему).
// POST / с операцией GetStatus: requestId=42 → ответ; requestId=0 → SOAP Fault (HTTP 500); requestId=slow → ответ через 2 с.
const http = require('node:http');

const env = (body) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;

function start(port = 0) {
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => {
      const id = /<(?:\w+:)?requestId>([^<]*)</.exec(data)?.[1];
      const send = (status, xml) => { res.writeHead(status, { 'Content-Type': 'text/xml; charset=utf-8' }); res.end(xml); };
      if (id === '0') return send(500, env('<soap:Fault><faultcode>soap:Client</faultcode><faultstring>Неверный requestId</faultstring></soap:Fault>'));
      if (id === 'slow') return setTimeout(() => send(200, env('<t:GetStatusResponse xmlns:t="urn:example:tax"><t:status>done</t:status></t:GetStatusResponse>')), 2000);
      return send(200, env(`<t:GetStatusResponse xmlns:t="urn:example:tax"><t:status>${id === '42' ? 'accepted' : 'unknown'}</t:status></t:GetStatusResponse>`));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start(Number(process.env.PORT ?? 8080)).then((s) => console.log('mock listening', s.address().port));
