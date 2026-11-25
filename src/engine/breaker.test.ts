import { describe, expect, it } from 'vitest';
import { Breaker } from './breaker.ts';

describe('circuit breaker', () => {
  const mk = () => new Breaker({ failureThreshold: 3, openMs: 1000 });
  it('открывается после N подряд ошибок и быстро отказывает', () => {
    const b = mk();
    for (let i = 0; i < 3; i++) expect(b.call(i, () => false)).toBe('fail');
    expect(b.state).toBe('open');
    let calls = 0;
    expect(b.call(500, () => (calls++, true))).toBe('rejected');
    expect(calls).toBe(0); // зависимость не вызывалась
  });
  it('успех сбрасывает счётчик ошибок', () => {
    const b = mk();
    b.call(0, () => false); b.call(1, () => false); b.call(2, () => true);
    b.call(3, () => false); b.call(4, () => false);
    expect(b.state).toBe('closed');
  });
  it('после openMs пробный вызов: успех закрывает, ошибка открывает снова', () => {
    const b = mk();
    for (let i = 0; i < 3; i++) b.call(i, () => false);
    expect(b.call(1500, () => true)).toBe('ok');
    expect(b.state).toBe('closed');
    for (let i = 0; i < 3; i++) b.call(2000 + i, () => false);
    expect(b.call(3100, () => false)).toBe('fail');
    expect(b.state).toBe('open');
    expect(b.call(3200, () => true)).toBe('rejected');
  });
});
