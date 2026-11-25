import { describe, expect, it } from 'vitest';
import { loadAllLessons } from './lessons.ts';
import { modules } from './modules.ts';
import { buildSummary } from './summary.ts';

describe('сводные тесты модулей', () => {
  it('в каждом модуле набирается 10–15 различных вопросов', async () => {
    const all = await loadAllLessons();
    for (const m of modules) {
      const ids = new Set(m.lessons.map((l) => l.id));
      const ls = all.filter((l) => ids.has(l.id));
      const qs = buildSummary(ls, 12, 7);
      expect(qs.length, m.id).toBeGreaterThanOrEqual(10);
      expect(qs.length, m.id).toBeLessThanOrEqual(15);
      expect(new Set(qs.map((q) => q.q)).size, m.id).toBe(qs.length);
      for (const q of qs) expect(q.answer).toBeLessThan(q.options.length);
    }
  }, 60000);
});
