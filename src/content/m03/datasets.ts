/** Датасеты для SQL-песочницы. Генерация детерминирована (без random()): результаты запросов воспроизводимы. */
export const shopDataset = `
CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, city text NOT NULL, created_at date NOT NULL);
INSERT INTO customers
  SELECT g, 'Клиент ' || g, (ARRAY['Астана','Алматы','Шымкент','Караганда','Актобе'])[1 + g % 5], DATE '2025-01-01' + (g % 365)
  FROM generate_series(1, 2000) g;

CREATE TABLE products (id int PRIMARY KEY, title text NOT NULL, price numeric(10,2) NOT NULL);
INSERT INTO products SELECT g, 'Товар ' || g, 100 + (g * 37) % 900 FROM generate_series(1, 50) g;

CREATE TABLE orders (
  id int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id),
  status text NOT NULL,
  created_at timestamp NOT NULL,
  total numeric(12,2) NOT NULL DEFAULT 0
);
INSERT INTO orders
  SELECT g, 1 + (g * 7919) % 2000, (ARRAY['new','paid','shipped','cancelled'])[1 + g % 4],
         TIMESTAMP '2026-01-01' + (g % 300) * INTERVAL '1 day', 0
  FROM generate_series(1, 20000) g;

CREATE TABLE order_items (
  order_id int NOT NULL REFERENCES orders(id),
  product_id int NOT NULL REFERENCES products(id),
  qty int NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
INSERT INTO order_items SELECT g, 1 + (g * 13) % 50, 1 + g % 5 FROM generate_series(1, 20000) g;
INSERT INTO order_items SELECT g, 1 + (g * 13 + 7) % 50, 1 + (g * 3) % 4 FROM generate_series(1, 20000) g;

UPDATE orders o SET total = s.t
  FROM (SELECT oi.order_id, sum(oi.qty * p.price) AS t FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY 1) s
  WHERE s.order_id = o.id;
ANALYZE;
`;

export const datasets: Record<string, { title: string; sql: string; description: string }> = {
  shop: {
    title: 'Магазин',
    sql: shopDataset,
    description: 'customers (2000), products (50), orders (20000), order_items (около 40000). Индексов, кроме первичных ключей, нет: добавляй свои.',
  },
  empty: { title: 'Пустая база', sql: '', description: 'Чистая база PostgreSQL для своих экспериментов.' },
};
