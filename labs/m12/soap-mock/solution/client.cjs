const http = require('node:http');

class SoapFault extends Error {
  constructor(faultcode, faultstring) {
    super(faultstring);
    this.faultcode = faultcode;
    this.faultstring = faultstring;
  }
}

const tag = (xml, name) => new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]*)<`).exec(xml)?.[1];

function getStatus(url, requestId, timeoutMs = 500) {
  const body = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="urn:example:tax"><soap:Body><t:GetStatus><t:requestId>${requestId}</t:requestId></t:GetStatus></soap:Body></soap:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"urn:example:tax#GetStatus"' } }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        // Fault приходит как ответ сервиса (обычно HTTP 500) и обрабатывается отдельно от сетевых ошибок
        if (/<(?:\w+:)?Fault[ >]/.test(data)) return reject(new SoapFault(tag(data, 'faultcode'), tag(data, 'faultstring')));
        resolve({ status: tag(data, 'status') });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { getStatus, SoapFault };
