# Заметки о выпуске v1.0 (черновик)

Состояние: ветка влита в `main` (2026-11-25), `ci`, `pages` и `oracle` на `main` зелёные, Pages включён. Тег `v1.0` на момент записи не создан: создание тега через `git push` и релиза через API возвращало ошибки GitHub (HTTP 500). Создать: `git tag v1.0 && git push origin v1.0` (сработает `release.yml`) либо запустить `release.yml` вручную с тегом `v1.0`.

Тег `v*` запускает `release.yml`: он собирает `dist-single` и `dist-offline` и создаёт релиз с этими файлами (`textbook-single.html`, `textbook-offline.zip`) и этим текстом.

## Что входит
- 70 уроков в 15 модулях, интерактивные модели и упражнения с автопроверкой.
- Банк вопросов собеседования: 192 вопроса; мок-интервью, карточки Лейтнера, STAR, рассказ о себе.
- Лаборатории (`labs/`): Node (m01), PostgreSQL (m03), Redis (m04), брокеры (m08), производительность (m10), SOAP (m12), capstone (m13).
- Три режима: `dist` (`npm run build`), `dist-single` (`npm run build:single`, один файл), `dist-offline` (`npm run build:offline`, затем `node serve.mjs`).

## Известные ограничения
- Проверено запуском на Docker 29: `labs/docker-compose.yml` (smoke), лаборатории RabbitMQ и Kafka, оракул изоляции на PostgreSQL 17, примеры Dockerfile и compose. На GitHub Actions выполнены `ci.yml` и `oracle.yml` (успешно); `pages.yml` срабатывает при пуше в `main`.
- Нет фактов о ШЭП и Kalkan: уроки модуля 12 общие, источники не найдены (`docs/research/m12.md`).
- Эталоны capstone: `capstone-nest` (NestJS; PGlite или настоящий PostgreSQL 17 через `DATABASE_URL`, без WebSocket) и `capstone-reference` (SQLite, с WebSocket). `capstone-nest` проверен на PostgreSQL 17 с RabbitMQ 4 и отдельно с Kafka 4.4 (Outbox → брокер → потребитель с inbox).
- Открытые вопросы: `docs/open-questions.md`.

## Чек-лист перед тегом
- [x] Выполнены `bash labs/scripts/smoke.sh` и `bash labs/scripts/run-broker-labs.sh` (2026-11-25, и на GitHub в oracle.yml)
- [x] Зелёные ci.yml и oracle.yml (ветка, 2026-11-25)
- [x] Зелёный pages.yml (после слияния в `main`, 2026-11-25)
- [x] Сборки `dist-single` и `dist-offline` прикрепляет `release.yml`
- [ ] Просмотрен `open-questions.md`
