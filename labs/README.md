# Локальные лаборатории

Здесь лежат задания, которые нужно запускать на своём компьютере: сценарии для Node.js, стенды с PostgreSQL, Redis, RabbitMQ и Kafka.

- `m01/event-loop` — сценарии event loop (сгенерированы из учебника).
- `m01/threadpool` — thread pool libuv: `pbkdf2.cjs` (размер пула), `zones.cjs` (что идёт в пул).
- `m01/blocking` — блокировка event loop и `worker_threads`.
- `m01/emitter-leak` — утечка слушателей EventEmitter.
- `m01/streams` — потоки, backpressure и пиковая память.
- `m01/graceful` — graceful shutdown (`SIGTERM`).

- `m08/saga`, `m08/outbox` — Saga и Outbox/Inbox без Docker (`node:sqlite`, всё в памяти): проверены локально.
- `m08/rabbitmq/basic`, `m08/rabbitmq/retry-dlq`, `m08/kafka/consumer-group` — нужны запущенные RabbitMQ и Kafka (`docker compose up -d --wait rabbitmq kafka`). Код выхода `2` — брокер недоступен, тест пропущен. **Не запускались в среде разработки** (нет Docker-демона): проверка в CI (`oracle.yml`) и у тебя.

В лабораториях `blocking`, `emitter-leak`, `streams`, `graceful`: `npm test` проверяет твою версию `server.cjs` или `process.cjs` (заготовка падает), `npm run test:solution` проверяет эталон из папки `solution`. Тот же принцип проверяется в CI автотестом `src/content/labs.test.ts`.
- `docker-compose.yml` — общие сервисы. Синтаксис и теги образов проверены, запуск не проверен (нет Docker-демона в среде разработки). Проверка: `bash labs/scripts/smoke.sh`.

Требования: Node.js (актуальный LTS) и Docker.
