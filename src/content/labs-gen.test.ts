import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSql, scenarios, simulate, type Level } from '../engine/isolation.ts';

describe('сгенерированные лаборатории соответствуют моделям', () => {
  it('labs/m03/isolation/scenarios.json актуален (npm run gen:labs:m03)', () => {
    const file = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'labs', 'm03', 'isolation', 'scenarios.json'), 'utf8')) as { id: string; level: Level; steps: { sql: string }[]; expected: unknown }[];
    const levels: Level[] = ['read committed', 'repeatable read', 'serializable'];
    const fresh = scenarios.flatMap((sc) => levels.map((level) => ({ id: `${sc.id} @ ${level}`, sql: sc.ops.map((op) => renderSql(op, level)), final: simulate(sc, level).final })));
    expect(file.map((f) => f.id)).toEqual(fresh.map((f) => f.id));
    file.forEach((f, i) => {
      expect(f.steps.map((s) => s.sql)).toEqual(fresh[i].sql);
      expect((f.expected as { final: unknown }).final).toEqual(fresh[i].final);
    });
  });
});
