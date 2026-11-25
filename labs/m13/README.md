# Capstone

- `capstone-starter/` — заготовка для собственного проекта: схема PostgreSQL, `docker-compose.yml`, список сценариев.
- `acceptance/` — приёмочные тесты HTTP-контракта (`POST /applications` с `Idempotency-Key`, `GET /applications/:id`, список с курсором, `cancel`). Запуск против вашего решения: `BASE_URL=http://127.0.0.1:3000 node acceptance/test.cjs`.
- `capstone-reference/` — эталон без фреймворков: SQLite (`node:sqlite`), Outbox, воркер отправки в `labs/m12/soap-mock`, ретраи, Fault, таймаут, rate limit, graceful shutdown, WebSocket `/ws`. Тест: `NODE_NO_WARNINGS=1 node capstone-reference/test.cjs`.
- `capstone-nest/` — эталон на NestJS: PGlite или настоящий PostgreSQL, Outbox, SOAP-мок, ретраи, rate limit (без WebSocket). Тест: `npx tsx --tsconfig labs/m13/capstone-nest/tsconfig.json labs/m13/capstone-nest/test.ts`. Для настоящего PostgreSQL: `cd labs && docker compose up -d --wait postgres`, затем `cd m13/capstone-nest && npm install && DATABASE_URL=postgres://lab:lab@localhost:5432/lab npm test`.

Не реализовано ни в одном эталоне: настоящий брокер (RabbitMQ/Kafka), inbox-таблица потребителя и нагрузочный прогон. Их проверяйте своими тестами по чек-листу урока m13-l02. Эталоны смотрите после собственной попытки.
