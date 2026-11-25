# Node.js Backend — интерактивный учебник

Интерактивный учебник для подготовки к собеседованию на Middle Node.js-разработчика: симуляторы, диаграммы, песочницы, задачи, тесты и тренажёр собеседования. Интерфейс на русском.

- Полное ТЗ и план реализации: [`docs/HANDOFF.md`](docs/HANDOFF.md). Учебный план: `docs/study-plan.md`.
- **Что готово, что проверено запуском, а что нет: [`docs/STATUS.md`](docs/STATUS.md)**. Открытые вопросы: [`docs/open-questions.md`](docs/open-questions.md).
- Описание общих компонентов: [`docs/components.md`](docs/components.md).

## Быстрый старт

```bash
npm install
npm run dev              # режим разработки
npm run build            # статический сайт в dist/ (используется для GitHub Pages)
npm run build:single     # один HTML-файл dist-single/index.html (открывается двойным кликом; без SQL-песочницы)
npm test                 # автотесты: модели против реальных Node.js, NestJS, PostgreSQL (PGlite), kafkajs
npm run lint:content     # проверка полноты и целостности уроков
npm run check:size       # бюджет размера стартового JS (< 250 КБ)
npm run bank             # статистика и проверка банка вопросов собеседования
npm run e2e              # сквозная проверка в браузере (Chrome: CHROME_PATH=...; нужен npm run preview)
```

Публикация на GitHub Pages: Settings → Pages → Source: **GitHub Actions**; сайт собирается и выкладывается из `main` (`.github/workflows/pages.yml`).

## Как проверяется достоверность

Каждый симулятор — это **модель**, помеченная бейджем «модель». Модели сверяются с реальными системами:

| Модель | С чем сверяется | Где |
|---|---|---|
| Event loop, EventEmitter, backpressure, thread pool | реальный Node.js | `npm test` |
| Жизненный цикл запроса и DI в NestJS | настоящие приложения NestJS 12 | `npm test` |
| SQL-упражнения и планы | настоящий PostgreSQL (PGlite, WASM) | `npm test` |
| Партиционер и назначение партиций Kafka | реализация `kafkajs` | `npm test` |
| Изоляция транзакций | реальный PostgreSQL | `labs/m03/isolation` в CI (`oracle.yml`) |
| RabbitMQ, Kafka (лаборатории) | живые брокеры | `labs/m08` в CI (`oracle.yml`) |

Что **не** проверялось запуском (нет Docker в среде разработки), честно перечислено в [`docs/STATUS.md`](docs/STATUS.md).

## Структура

```
src/app/          оболочка: навигация, темы, прогресс (с миграциями), страницы, поиск
src/components/   виджеты (загружаются лениво), песочницы, тесты, карточки задач
src/content/      модули, уроки, банк вопросов, упражнения (данные, не вёрстка)
src/engine/       модели и движки (чистая логика) с автотестами
labs/             задания для локального запуска (Node.js, Docker); у каждого: заготовка падает, решение проходит
tools/            линтер контента, генерация лабораторий, e2e (с axe и проверкой ширин), бюджет размера
docs/             ТЗ, статус, компоненты, исследования (docs/research)
.github/workflows ci, pages, oracle
```

## Режимы практики

- 🌐 **В браузере** — выполняется на странице.
- 💻 **Локально** — нужно запустить на своём компьютере (`labs/`): `npm test` в папке лаборатории проверяет твою версию, `npm run test:solution` — эталон.
- 🔀 **Гибрид** — модель в браузере плюс проверка на реальной системе.
