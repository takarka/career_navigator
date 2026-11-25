# Capstone: приёмочные тесты

- `acceptance/` — тесты HTTP-контракта (`POST /applications` с `Idempotency-Key`, `GET /applications/:id`, список с курсором, `cancel`). Запуск против вашего решения: `BASE_URL=http://127.0.0.1:3000 node acceptance/test.cjs`.
- `capstone-reference/` — **минимальный эталон контракта** в памяти (без БД, брокера, SOAP и подписи). Служит для проверки самих тестов; полноценный проект пишется самостоятельно по урокам m13.

Не покрыто тестами приёмки: Outbox, брокер, интеграция с `labs/m12/soap-mock`, graceful shutdown, WebSocket. Их проверяйте своими тестами по чек-листу урока m13-l02.
