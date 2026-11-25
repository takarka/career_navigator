import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { datasets } from './datasets.ts';
import { allSqlExercises } from './exercises.ts';
import { createDb, runScript, runSql, sameResult } from '../../engine/sql.ts';

/** Оракул: решения проверяются на настоящем PostgreSQL (PGlite): ожидаемые результаты не «придуманы», а получены запуском. */
describe('SQL-упражнения на PGlite', () => {
  let shared: PGlite;
  beforeAll(async () => {
    shared = await createDb(datasets.shop.sql);
  }, 120000);
  afterAll(async () => {
    await shared.close();
  });

  for (const [name, ex] of Object.entries(allSqlExercises)) {
    it(`${name}: решение проходит проверку, заготовка не проходит`, { timeout: 120000 }, async () => {
      const db = await createDb(datasets[ex.dataset].sql); // каждому упражнению — свежая база
      try {
        const check = async (script: string) => {
          const multi = script.replace(/--.*$/gm, '').trim().replace(/;\s*$/, '').includes(';');
          const r = multi ? await runScript(db, script) : await runSql(db, script.replace(/--.*$/gm, ''));
          if ((ex.kind ?? 'result') === 'plan') {
            const p = await runSql(db, `EXPLAIN (FORMAT JSON) ${ex.planQuery}`);
            return !r.error && !p.error && new RegExp(ex.planNode!, 's').test(JSON.stringify(p.plan));
          }
          return sameResult(r, ex.expected!, !!ex.orderMatters);
        };
        expect(await check(ex.solution), 'решение должно проходить').toBe(true);
        const fresh = await createDb(datasets[ex.dataset].sql);
        try {
          const multi = false;
          void multi;
          const r = await runSql(fresh, ex.starter.replace(/--.*$/gm, ''));
          if ((ex.kind ?? 'result') === 'plan') {
            const p = await runSql(fresh, `EXPLAIN (FORMAT JSON) ${ex.planQuery}`);
            expect(new RegExp(ex.planNode!, 's').test(JSON.stringify(p.plan)), 'заготовка не должна проходить').toBe(false);
          } else expect(sameResult(r, ex.expected!, !!ex.orderMatters), 'заготовка не должна проходить').toBe(false);
        } finally {
          await fresh.close();
        }
      } finally {
        await db.close();
      }
    });
  }

  it('датасет детерминирован и ожидаемого размера', async () => {
    const r = await runSql(shared, 'SELECT (SELECT count(*) FROM customers) c, (SELECT count(*) FROM orders) o, (SELECT count(*) FROM order_items) i');
    expect(r.rows[0].map(Number)).toEqual([2000, 20000, 40000]);
  });
});
