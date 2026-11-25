# Заметки о выпуске v1.0 (черновик)

Статус: **кандидат**. Тег ставится после слияния ветки в `main` и после проверок на Docker (список в `STATUS.md`).

## Что входит
- 70 уроков в 15 модулях, интерактивные модели и упражнения с автопроверкой.
- Банк вопросов собеседования: 192 вопроса; мок-интервью, карточки Лейтнера, STAR, рассказ о себе.
- Лаборатории (`labs/`): Node (m01), PostgreSQL (m03), Redis (m04), брокеры (m08), производительность (m10), SOAP (m12), capstone (m13).
- Три режима: `dist` (`npm run build`), `dist-single` (`npm run build:single`, один файл), `dist-offline` (`npm run build:offline`, затем `node serve.mjs`).

## Известные ограничения
- Проверено запуском на Docker 29: `labs/docker-compose.yml` (smoke), лаборатории RabbitMQ и Kafka, оракул изоляции на PostgreSQL 17, примеры Dockerfile и compose. Не запускались на GitHub: workflow Actions.
- Нет фактов о ШЭП и Kalkan: уроки модуля 12 общие, источники не найдены (`docs/research/m12.md`).
- Эталоны capstone: `capstone-nest` (NestJS; PGlite или настоящий PostgreSQL 17 через `DATABASE_URL`, без WebSocket) и `capstone-reference` (SQLite, с WebSocket). Настоящий брокер в эталонах не используется: событие идёт через таблицу outbox и воркер.
- Открытые вопросы: `docs/open-questions.md`.

## Чек-лист перед тегом
- [ ] Выполнены `bash labs/scripts/smoke.sh` и `bash labs/scripts/run-broker-labs.sh`
- [ ] Зелёные ci.yml, pages.yml, oracle.yml
- [ ] Сборки `dist-single` и `dist-offline` приложены к релизу
- [ ] Просмотрен `open-questions.md`
