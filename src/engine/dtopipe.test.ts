import { describe, expect, it } from 'vitest';
import { envRules, orderDtoRules, validateDto, validateEnv } from './dtopipe.ts';

const base = { whitelist: false, forbidNonWhitelisted: false, transform: false };

describe('модель ValidationPipe', () => {
  it('корректное тело проходит', () => expect(validateDto({ customerId: 5 }, orderDtoRules, base).status).toBe(200));
  it('отсутствие обязательного поля — 400', () => expect(validateDto({}, orderDtoRules, base).errors).toContain('customerId should not be empty'));
  it('строка вместо числа отклоняется без transform и принимается с transform', () => {
    expect(validateDto({ customerId: '5' }, orderDtoRules, base).status).toBe(400);
    const r = validateDto({ customerId: '5' }, orderDtoRules, { ...base, transform: true });
    expect(r.status).toBe(200);
    expect(r.value).toEqual({ customerId: 5 });
  });
  it('whitelist молча убирает лишние поля (mass assignment)', () => {
    const r = validateDto({ customerId: 1, isAdmin: true }, orderDtoRules, { ...base, whitelist: true });
    expect(r.value).toEqual({ customerId: 1 });
    expect(r.stripped).toEqual(['isAdmin']);
  });
  it('без whitelist лишние поля остаются в объекте', () => {
    expect(validateDto({ customerId: 1, isAdmin: true }, orderDtoRules, base).value).toEqual({ isAdmin: true, customerId: 1 });
  });
  it('forbidNonWhitelisted отклоняет лишние поля только вместе с whitelist', () => {
    const o = { whitelist: true, forbidNonWhitelisted: true, transform: false };
    expect(validateDto({ customerId: 1, isAdmin: true }, orderDtoRules, o).errors).toContain('property isAdmin should not exist');
    expect(validateDto({ customerId: 1, isAdmin: true }, orderDtoRules, { ...o, whitelist: false }).status).toBe(200);
  });
  it('ограничения длины и перечисления', () => {
    expect(validateDto({ customerId: 1, comment: 'x'.repeat(30) }, orderDtoRules, base).status).toBe(400);
    expect(validateDto({ customerId: 1, role: 'root' }, orderDtoRules, base).status).toBe(400);
  });
});

describe('проверка окружения при старте', () => {
  const ok = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@db:5432/app', JWT_SECRET: 'x'.repeat(20) };
  it('корректное окружение проходит', () => expect(validateEnv(ok, envRules)).toEqual([]));
  it('находит отсутствующие и неверные значения', () => {
    const errs = validateEnv({ NODE_ENV: 'staging', PORT: '99999', DATABASE_URL: 'not a url', JWT_SECRET: 'short' }, envRules);
    expect(errs).toHaveLength(4);
  });
  it('необязательная переменная может отсутствовать', () => expect(validateEnv(ok, envRules).some((e) => e.startsWith('PORT'))).toBe(false));
});
