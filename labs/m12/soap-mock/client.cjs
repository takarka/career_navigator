// ЗАДАНИЕ: клиент SOAP. getStatus(url, requestId) должен:
//  1) отправить запрос GetStatus (SOAP 1.1, Content-Type text/xml, заголовок SOAPAction);
//  2) при успехе вернуть { status } из элемента status;
//  3) при SOAP Fault бросить ошибку SoapFault с полями faultcode и faultstring (не путать с сетевой ошибкой);
//  4) при отсутствии ответа дольше timeoutMs бросить ошибку с message 'timeout'.
// Сейчас клиент возвращает сырой текст ответа и не умеет ни Fault, ни таймаут. Проверка: npm test
const http = require('node:http');

class SoapFault extends Error {}

function getStatus(url, requestId, timeoutMs = 500) {
  const body = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="urn:example:tax"><soap:Body><t:GetStatus><t:requestId>${requestId}</t:requestId></t:GetStatus></soap:Body></soap:Envelope>`;
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"urn:example:tax#GetStatus"' } }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve(data)); // ← сырой текст
    });
    req.on('error', reject);
    req.end(body);
  });
}

module.exports = { getStatus, SoapFault };
