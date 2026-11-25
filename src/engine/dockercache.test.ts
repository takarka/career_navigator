import { describe, expect, it } from 'vitest';
import { badOrder, goodOrder, rebuilt } from './dockercache.ts';

describe('кэш слоёв Docker', () => {
  it('без изменений всё берётся из кэша', () => expect(rebuilt(goodOrder, []).every((x) => !x)).toBe(true));
  it('правильный порядок: правка исходников не пересобирает npm ci', () => {
    const r = rebuilt(goodOrder, ['src/app.ts']);
    expect(r).toEqual([false, false, false, false, true, true]);
  });
  it('правильный порядок: правка package.json пересобирает установку зависимостей', () => {
    expect(rebuilt(goodOrder, ['package.json'])).toEqual([false, false, true, true, true, true]);
  });
  it('неправильный порядок: любая правка инвалидирует npm ci', () => {
    expect(rebuilt(badOrder, ['src/app.ts'])).toEqual([false, false, true, true, true]);
  });
});
