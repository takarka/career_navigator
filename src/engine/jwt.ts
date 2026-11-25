/**
 * JWT (RFC 7519) с подписью HS256 на Web Crypto: работает в браузере и в Node.js.
 * Это учебная реализация для демонстрации устройства токена и атак; в продакшене используй проверенные библиотеки.
 * Результат сверяется с библиотекой jsonwebtoken автотестом (jwt.test.ts).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str: string): Uint8Array {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const part = (o: unknown) => b64urlEncode(enc.encode(JSON.stringify(o)));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signHS256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head = part({ alg: 'HS256', typ: 'JWT' });
  const body = part(payload);
  return `${head}.${body}.${b64urlEncode(await hmac(secret, `${head}.${body}`))}`;
}

export interface Decoded {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

/** Только разбор без проверки подписи: содержимое токена НЕ зашифровано, его может прочитать любой. */
export function decode(token: string): Decoded | null {
  const p = token.split('.');
  if (p.length !== 3) return null;
  try {
    return { header: JSON.parse(dec.decode(b64urlDecode(p[0]))), payload: JSON.parse(dec.decode(b64urlDecode(p[1]))), signature: p[2] };
  } catch {
    return null;
  }
}

export interface VerifyOptions {
  now: number; // секунды Unix
  issuer?: string;
  audience?: string;
  /** Разрешённые алгоритмы. Явный список обязателен: не доверяй полю alg из самого токена. */
  algorithms: string[];
}

export type VerifyResult = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string };

export async function verify(token: string, secret: string, o: VerifyOptions): Promise<VerifyResult> {
  const d = decode(token);
  if (!d) return { ok: false, reason: 'токен нечитаем' };
  const alg = String(d.header.alg);
  if (!o.algorithms.includes(alg)) return { ok: false, reason: `алгоритм «${alg}» не разрешён (разрешены: ${o.algorithms.join(', ')})` };
  if (alg !== 'HS256') return { ok: false, reason: `алгоритм «${alg}» в этой демонстрации не поддерживается` };
  const [h, b, s] = token.split('.');
  const expected = b64urlEncode(await hmac(secret, `${h}.${b}`));
  // сравнение за постоянное время (в продакшене используйте crypto.timingSafeEqual)
  let diff = expected.length ^ s.length;
  for (let i = 0; i < Math.min(expected.length, s.length); i++) diff |= expected.charCodeAt(i) ^ s.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'подпись не совпала: токен изменён или подписан другим ключом' };
  const p = d.payload;
  if (typeof p.exp === 'number' && p.exp <= o.now) return { ok: false, reason: 'срок действия истёк (exp)' };
  if (typeof p.nbf === 'number' && p.nbf > o.now) return { ok: false, reason: 'токен ещё не действует (nbf)' };
  if (o.issuer !== undefined && p.iss !== o.issuer) return { ok: false, reason: `неверный издатель (iss): ожидался ${o.issuer}` };
  if (o.audience !== undefined) {
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
    if (!aud.includes(o.audience)) return { ok: false, reason: `неверная аудитория (aud): ожидалась ${o.audience}` };
  }
  return { ok: true, payload: p };
}
