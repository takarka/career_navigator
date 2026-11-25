import { describe, expect, it } from 'vitest';
import { IdemServer } from './idemkey.ts';

describe('Idempotency-Key', () => {
  it('без ключа повтор запроса создаёт второй платёж', () => {
    const s = new IdemServer();
    s.post(undefined, '{"sum":100}');
    s.post(undefined, '{"sum":100}');
    expect(s.charges).toHaveLength(2);
  });
  it('с ключом повтор возвращает сохранённый ответ и не списывает второй раз', () => {
    const s = new IdemServer();
    const a = s.post('k1', '{"sum":100}');
    const b = s.post('k1', '{"sum":100}');
    expect(s.charges).toHaveLength(1);
    expect(b).toMatchObject({ status: a.status, body: a.body, executed: false });
  });
  it('тот же ключ с другим телом — 422', () => {
    const s = new IdemServer();
    s.post('k1', '{"sum":100}');
    expect(s.post('k1', '{"sum":999}').status).toBe(422);
    expect(s.charges).toHaveLength(1);
  });
  it('повтор во время обработки — 409, после завершения — сохранённый ответ', () => {
    const s = new IdemServer();
    const first = s.begin('k1', 'b');
    expect(s.post('k1', 'b').status).toBe(409);
    const done = first.finish!();
    expect(s.post('k1', 'b')).toMatchObject({ status: done.status, executed: false });
    expect(s.charges).toHaveLength(1);
  });
  it('разные ключи — независимые операции', () => {
    const s = new IdemServer();
    s.post('a', 'x');
    s.post('b', 'x');
    expect(s.charges).toHaveLength(2);
  });
});
