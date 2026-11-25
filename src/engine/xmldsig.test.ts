import { generateKeyPairSync } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { describe, expect, it } from 'vitest';

/** Оракул для урока про XML-DSig: настоящая подпись библиотекой xml-crypto, проверка подмены и канонизации. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ALG = { signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: C14N };

function sign(xml: string): string {
  const sig = new SignedXml({ privateKey: priv, ...ALG });
  sig.addReference({ xpath: "//*[local-name(.)='Body']", transforms: [C14N], digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='Body']", action: 'after' } });
  return sig.getSignedXml();
}
function verify(xml: string): boolean {
  const m = xml.match(/<Signature[\s\S]*<\/Signature>/);
  const v = new SignedXml({ publicCert: pub });
  v.loadSignature(m![0]);
  try {
    return v.checkSignature(xml);
  } catch {
    return false;
  }
}

const msg = `<Envelope><Body><Payment><sum>100</sum></Payment></Body></Envelope>`;

describe('XML-DSig (xml-crypto)', () => {
  const signed = sign(msg);
  it('подписанное сообщение проходит проверку', () => expect(verify(signed)).toBe(true));
  it('изменение содержимого ломает подпись', () => expect(verify(signed.replace('<sum>100</sum>', '<sum>999</sum>'))).toBe(false));
  it('канонизация: незначимые различия записи не ломают подпись (порядок и кавычки атрибутов, пробелы в теге)', () => {
    const a = sign(`<Envelope><Body><P b="2" a='1'>x</P></Body></Envelope>`);
    const reformatted = a.replace(`<P b="2" a='1'>`, `<P  a="1"   b="2" >`);
    expect(verify(reformatted)).toBe(true);
  });
  it('значимое изменение текста (пробел внутри) ломает подпись', () => {
    expect(verify(signed.replace('<sum>100</sum>', '<sum> 100</sum>'))).toBe(false);
  });
});
