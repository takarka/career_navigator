# Заготовка capstone

Скопируйте папку в **свой** репозиторий и реализуйте сервис заявок. Критерии: урок m13-l02 и `labs/m13/acceptance`.

## Структура
- `src/` — модули приложения (создайте NestJS-проект: `npx @nestjs/cli new .` или свой каркас).
- `migrations/` — SQL-миграции (`001_init.sql` — заготовка схемы).
- `docker-compose.yml` — PostgreSQL, Redis, RabbitMQ (запуск не проверялся: нужен Docker).
- `test/` — ваши unit и интеграционные тесты; сценарии из чек-листа приёмки отмечены TODO.

## Минимальный API
`POST /applications` (`Idempotency-Key`), `GET /applications/:id`, `GET /applications?cursor=…&limit=…`, `POST /applications/:id/cancel`.

## Проверка контракта
`BASE_URL=http://127.0.0.1:3000 node ../acceptance/test.cjs`

Эталон: `../capstone-reference` (без NestJS, на SQLite). Смотрите после собственной попытки.
