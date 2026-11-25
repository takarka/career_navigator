-- Заготовка схемы (PostgreSQL). Дополните индексами под ваши запросы и подтвердите их EXPLAIN ANALYZE.
CREATE TABLE application (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'NEW',
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES application(id),
  event text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  done boolean NOT NULL DEFAULT false
);
CREATE TABLE inbox (message_id text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE status_history (id bigserial PRIMARY KEY, application_id uuid NOT NULL, status text NOT NULL, at timestamptz NOT NULL DEFAULT now());
