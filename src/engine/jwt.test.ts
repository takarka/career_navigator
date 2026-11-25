import jsonwebtoken from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, decode, signHS256, verify } from './jwt.ts';

const secret = 'очень-секретный-ключ-для-тестов';
const payload = { sub: 'u1', role: 'admin', iss: 'auth.example', aud: 'api', iat: 1700000000, exp: 1700003600 };

describe('JWT: сверка с jsonwebtoken', () => {
  it('токен, подписанный нашим кодом, совпадает с токеном jsonwebtoken (HS256)', async () => {
    const ours = await signHS256(payload, secret);
    const theirs = jsonwebtoken.sign(payload, secret, { algorithm: 'HS256' });
    expect(ours).toBe(theirs);
  });

  it('токен jsonwebtoken принимается нашей проверкой', async () => {
    const t = jsonwebtoken.sign(payload, secret, { algorithm: 'HS256' });
    const r = await verify(t, secret, { now: 1700000100, algorithms: ['HS256'], issuer: 'auth.example', audience: 'api' });
    expect(r.ok).toBe(true);
  });

  it('наш токен принимается jsonwebtoken', async () => {
    const t = await signHS256(payload, secret);
    expect(() => jsonwebtoken.verify(t, secret, { algorithms: ['HS256'], clockTimestamp: 1700000100 })).not.toThrow();
  });

  it('base64url без дополнения, круговое преобразование', () => {
    for (const n of [0, 1, 2, 3, 4, 31, 32]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      const s = b64urlEncode(b);
      expect(s).not.toMatch(/[+/=]/);
      expect([...b64urlDecode(s)]).toEqual([...b]);
    }
  });
});

describe('JWT: проверка и атаки', () => {
  const opts = { now: 1700000100, algorithms: ['HS256'], issuer: 'auth.example', audience: 'api' };

  it('payload читается без ключа: токен подписан, но не зашифрован', async () => {
    expect(decode(await signHS256(payload, secret))?.payload).toMatchObject({ sub: 'u1', role: 'admin' });
  });

  it('подмена содержимого ломает подпись', async () => {
    const t = await signHS256(payload, secret);
    const [h, , s] = t.split('.');
    const forged = [h, b64urlEncode(new TextEncoder().encode(JSON.stringify({ ...payload, role: 'superadmin' }))), s].join('.');
    const r = await verify(forged, secret, opts);
    expect(r).toMatchObject({ ok: false });
  });

  it('alg=none отклоняется, потому что список алгоритмов задан явно', async () => {
    const none = [b64urlEncode(new TextEncoder().encode('{"alg":"none","typ":"JWT"}')), b64urlEncode(new TextEncoder().encode(JSON.stringify(payload))), ''].join('.');
    const r = await verify(none, secret, opts);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toContain('не разрешён');
  });

  it('просроченный токен, неверные iss и aud, чужой ключ', async () => {
    const t = await signHS256(payload, secret);
    expect(await verify(t, secret, { ...opts, now: 1700009999 })).toMatchObject({ ok: false, reason: 'срок действия истёк (exp)' });
    expect(await verify(t, secret, { ...opts, issuer: 'other' })).toMatchObject({ ok: false });
    expect(await verify(t, secret, { ...opts, audience: 'admin-api' })).toMatchObject({ ok: false });
    expect(await verify(t, 'другой-ключ', opts)).toMatchObject({ ok: false });
  });

  it('мусор вместо токена не вызывает исключений', async () => {
    for (const t of ['', 'a.b', 'a.b.c', '...']) expect((await verify(t, secret, opts)).ok).toBe(false);
  });
});
