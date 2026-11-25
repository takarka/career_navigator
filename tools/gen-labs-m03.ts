/**
 * Генерирует labs/m03/isolation/scenarios.json из модели изоляции (src/engine/isolation.ts):
 * сценарии, SQL для реального PostgreSQL и ожидаемые результаты модели. Запуск: npm run gen:labs:m03
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSql, scenarios, simulate, type Level } from '../src/engine/isolation.ts';

const levels: Level[] = ['read committed', 'repeatable read', 'serializable'];
const out = scenarios.flatMap((sc) =>
  levels.map((level) => {
    const o = simulate(sc, level);
    const values: Record<string, (number | undefined)[]> = { T1: [], T2: [] };
    for (const st of o.steps) if (['read', 'count', 'forUpdate'].includes(st.op.op) && !st.error && !st.blocked) values[st.op.s].push(st.value); // заблокированный шаг значения не даёт: оно появится после разблокировки
    return {
      id: `${sc.id} @ ${level}`,
      title: sc.title,
      level,
      initial: sc.initial,
      steps: sc.ops.map((op) => ({ s: op.s, op: op.op, sql: renderSql(op, level) })),
      expected: { values, final: o.final, aborted: [...o.aborted].sort() },
    };
  }),
);
const target = join(import.meta.dirname, '..', 'labs', 'm03', 'isolation', 'scenarios.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Сценариев: ${out.length} → ${target}`);
