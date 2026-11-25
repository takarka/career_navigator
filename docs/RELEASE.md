# Заметки о выпуске v1.0 (черновик)

Статус: **кандидат**. Тег ставится после слияния ветки в `main` и после проверок на Docker (список в `STATUS.md`).

## Что входит
- 70 уроков в 15 модулях, интерактивные модели и упражнения с автопроверкой.
- Банк вопросов собеседования: 192 вопроса; мок-интервью, карточки Лейтнера, STAR, рассказ о себе.
- Лаборатории (`labs/`): Node (m01), PostgreSQL (m03), Redis (m04), брокеры (m08), производительность (m10), SOAP (m12), capstone (m13).
- Три режима: `dist` (`npm run build`), `dist-single` (`npm run build:single`, один файл), `dist-offline` (`npm run build:offline`, затем `node serve.mjs`).

## Известные ограничения
- Не проверялось запуском (нет Docker): `labs/docker-compose.yml`, лаборатории на RabbitMQ и Kafka, оракул изоляции на PostgreSQL, примеры Dockerfile и compose, workflow GitHub Actions.
- Нет фактов о ШЭП и Kalkan: уроки модуля 12 общие, источники не найдены (`docs/research/m12.md`).
- Эталон capstone упрощён: SQLite вместо PostgreSQL, без NestJS, настоящего брокера и WebSocket.
- Открытые вопросы: `docs/open-questions.md`.

## Чек-лист перед тегом
- [ ] Выполнены `bash labs/scripts/smoke.sh` и `bash labs/scripts/run-broker-labs.sh`
- [ ] Зелёные ci.yml, pages.yml, oracle.yml
- [ ] Сборки `dist-single` и `dist-offline` приложены к релизу
- [ ] Просмотрен `open-questions.md`
