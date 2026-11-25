// Оракул изоляции: сценарии из модели (scenarios.json, генерируется: npm run gen:labs:m03 в корне репозитория)
// выполняются на РЕАЛЬНОМ PostgreSQL двумя соединениями, результаты сравниваются с моделью.
// Нужен PostgreSQL (cd labs && docker compose up -d --wait postgres). Код выхода 2 — база недоступна (тест пропущен).
// Выполнен 2026-11-25 на PostgreSQL 17: 15 из 15 сценариев совпали с моделью. Также запускается в CI (oracle.yml).
const { Client } = require('pg');
const scenarios = require('./scenarios.json');

const url = process.env.DATABASE_URL ?? 'postgres://lab:lab@localhost:5432/lab';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runScenario(sc) {
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query('DROP TABLE IF EXISTS kv');
  await admin.query('CREATE TABLE kv (k text PRIMARY KEY, v int NOT NULL)');
  for (const [k, v] of Object.entries(sc.initial)) await admin.query('INSERT INTO kv VALUES ($1, $2)', [k, v]);

  const conns = { T1: new Client({ connectionString: url }), T2: new Client({ connectionString: url }) };
  await Promise.all(Object.values(conns).map((c) => c.connect()));
  const chain = { T1: Promise.resolve(), T2: Promise.resolve() };
  const values = { T1: [], T2: [] };
  const aborted = new Set();
  const last = { T1: {}, T2: {} };
  const failed = { T1: false, T2: false };

  const exec = (s, step) => async () => {
    if (failed[s]) return;
    let sql = step.sql;
    const m = /\$LAST/.exec(sql);
    if (m) {
      const k = /WHERE k = '(\w+)'/.exec(sql)[1];
      sql = sql.replace('$LAST', String(last[s][k]));
    }
    try {
      const res = await conns[s].query(sql);
      if (step.op === 'read' || step.op === 'forUpdate') {
        const v = res.rows[0]?.v;
        values[s].push(v);
        const k = /WHERE k = '(\w+)'/.exec(sql)[1];
        last[s][k] = v;
      } else if (step.op === 'count') values[s].push(res.rows[0].v);
    } catch (e) {
      if (e.code === '40001') {
        aborted.add(s);
        failed[s] = true;
        await conns[s].query('ROLLBACK').catch(() => {});
      } else throw e;
    }
  };

  for (const step of sc.steps) {
    const p = (chain[step.s] = chain[step.s].then(exec(step.s, step)));
    // даём шанс завершиться; если команда ждёт блокировку, переходим к следующему шагу другой сессии
    await Promise.race([p, sleep(200)]);
  }
  await Promise.all([chain.T1, chain.T2]);
  const final = {};
  for (const r of (await admin.query('SELECT k, v FROM kv ORDER BY k')).rows) final[r.k] = r.v;
  await Promise.all([...Object.values(conns), admin].map((c) => c.end()));
  return { values, final, aborted: [...aborted].sort() };
}

(async () => {
  try {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.end();
  } catch (e) {
    console.log(`PostgreSQL недоступен (${url}): ${e.message}\nПоднимите базу: cd labs && docker compose up -d --wait postgres`);
    process.exit(2);
  }
  let failures = 0;
  for (const sc of scenarios) {
    let real;
    try {
      real = await runScenario(sc);
    } catch (e) {
      console.log(`ОШИБКА ${sc.id}: ${e.message}`);
      failures++;
      continue;
    }
    const ok = JSON.stringify(real) === JSON.stringify(sc.expected);
    console.log(`${ok ? 'OK    ' : 'РАСХОЖДЕНИЕ'} ${sc.id}`);
    if (!ok) {
      console.log('  модель: ', JSON.stringify(sc.expected));
      console.log('  реально:', JSON.stringify(real));
      failures++;
    }
  }
  if (failures) {
    console.log(`ПРОВАЛ: расхождений с реальным PostgreSQL: ${failures}`);
    process.exit(1);
  }
  console.log('OK');
})();
