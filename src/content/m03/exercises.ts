import type { SqlExercise } from '../types.ts';

export const exStatusCount: SqlExercise = {
  dataset: 'shop',
  starter: `-- Сколько заказов в каждом статусе? Столбцы: status, n. Порядок: по status.\nSELECT * FROM orders LIMIT 5;`,
  solution: `SELECT status, count(*) AS n FROM orders GROUP BY status ORDER BY status;`,
  expected: { columns: ['status', 'n'], rows: [['cancelled', 5000], ['new', 5000], ['paid', 5000], ['shipped', 5000]] },
  orderMatters: true,
};

export const exAstana: SqlExercise = {
  dataset: 'shop',
  starter: `-- Клиенты из Астаны с id меньше 20. Столбцы: id, name. Порядок: по id.\nSELECT id, name FROM customers;`,
  solution: `SELECT id, name FROM customers WHERE city = 'Астана' AND id < 20 ORDER BY id;`,
  expected: { columns: ['id', 'name'], rows: [[5, 'Клиент 5'], [10, 'Клиент 10'], [15, 'Клиент 15']] },
  orderMatters: true,
};

export const exProductQty: SqlExercise = {
  dataset: 'shop',
  starter: `-- Сколько всего штук товара с id = 1 продано (по всем заказам)? Один столбец total_qty.\nSELECT * FROM order_items LIMIT 5;`,
  solution: `SELECT sum(qty) AS total_qty FROM order_items WHERE product_id = 1;`,
  expected: { columns: ['total_qty'], rows: [[1600]] },
};

export const exRank: SqlExercise = {
  dataset: 'shop',
  starter: `-- Для заказов с id <= 5 покажи id, total и место по убыванию суммы (rnk). Порядок: по rnk. Подсказка: оконная функция rank().\nSELECT id, total FROM orders WHERE id <= 5;`,
  solution: `SELECT id, total, rank() OVER (ORDER BY total DESC, id) AS rnk FROM orders WHERE id <= 5 ORDER BY rnk;`,
  expected: { columns: ['id', 'total', 'rnk'], rows: [[1, 4744, 1], [3, 4598, 2], [5, 4496, 3], [2, 1971, 4], [4, 1525, 5]] },
  orderMatters: true,
};

export const exIndex: SqlExercise = {
  dataset: 'shop',
  kind: 'plan',
  starter: `-- Запрос ниже читает всю таблицу заказов. Добавь индекс, чтобы PostgreSQL перестал сканировать её целиком.\nSELECT * FROM orders WHERE customer_id = 42;`,
  solution: `CREATE INDEX orders_customer_id_idx ON orders (customer_id);\nANALYZE orders;\nSELECT * FROM orders WHERE customer_id = 42;`,
  planQuery: `SELECT * FROM orders WHERE customer_id = 42`,
  planNode: 'Index Scan|Bitmap Index Scan|Index Only Scan',
};

export const exIndexOrder: SqlExercise = {
  dataset: 'shop',
  kind: 'plan',
  starter: `-- 10 самых свежих заказов. Сейчас PostgreSQL читает всю таблицу и сортирует. Добавь индекс так, чтобы отдельная сортировка (узел Sort) в плане пропала.\nSELECT * FROM orders ORDER BY created_at DESC LIMIT 10;`,
  solution: `CREATE INDEX orders_created_at_idx ON orders (created_at DESC);\nANALYZE orders;\nSELECT * FROM orders ORDER BY created_at DESC LIMIT 10;`,
  planQuery: `SELECT * FROM orders ORDER BY created_at DESC LIMIT 10`,
  planNode: '^(?!.*"Node Type":"Sort").*Index Scan',
};

export const exRollback: SqlExercise = {
  dataset: 'shop',
  starter: `-- Эксперимент в транзакции: удали позиции с qty = 1, посмотри результат, затем ОТМЕНИ изменения так,\n-- чтобы последний запрос вернул исходное число позиций (n = 40000).\nBEGIN;\nDELETE FROM order_items WHERE qty = 1;\nSELECT count(*) AS n FROM order_items;`,
  solution: `BEGIN;\nDELETE FROM order_items WHERE qty = 1;\nROLLBACK;\nSELECT count(*) AS n FROM order_items;`,
  expected: { columns: ['n'], rows: [[40000]] },
};

export const exKeyset: SqlExercise = {
  dataset: 'shop',
  starter: `-- Лента оплаченных заказов (status = 'paid'). Клиент запомнил id последнего показанного заказа: 100.\n-- Нужна следующая страница из 3 заказов (столбец id, порядок по id) — keyset-пагинация: условие по id вместо OFFSET.\nSELECT id FROM orders WHERE status = 'paid' ORDER BY id OFFSET 100 LIMIT 3;`,
  solution: `SELECT id FROM orders WHERE status = 'paid' AND id > 100 ORDER BY id LIMIT 3;`,
  expected: { columns: ['id'], rows: [[101], [105], [109]] },
  orderMatters: true,
};

export const allSqlExercises = { exStatusCount, exAstana, exProductQty, exRank, exIndex, exIndexOrder, exRollback, exKeyset };
