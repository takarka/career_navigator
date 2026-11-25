# Общие компоненты: API

Страница-демо: `#/demo` (в dev-режиме и в сборке). Чистая логика каждого компонента вынесена в `src/engine/` и покрыта тестами.

## LazyWidget и реестр виджетов
`src/components/widgets.tsx`. Реестр `widgetLoaders: имя → () => import(...)`. В контенте виджет подключается блоком
`{ t: 'widget', name, props, caption, model }`, в задаче — полем `widget`. Новый виджет = одна строка в реестре;
линтер контента проверяет, что имя зарегистрировано.

## Timeline
`<Timeline spec id? />`, модель `src/engine/timeline.ts`.
`TimelineSpec = { lanes[{id,title}], events[{id,lane,at,dur?,label,kind?,step}], arrows?[{from,to,label?}], steps[{title,text}] }`.
`kind`: `ok | bad | wait | info`. Событие появляется на шаге `step`; управление через `SimPlayer`.
`validateTimeline(spec)` возвращает список ошибок (неизвестная дорожка, шаг вне диапазона, стрелка к несуществующему событию).

## Chart
`<Chart kind="line"|"bar" series title xLabel? yLabel? categories? />`, математика в `src/engine/chart.ts`
(`niceTicks`, `scaleLinear`, `percentile`, `histogram`). SVG без библиотек, `role="img"`, таблица данных в `<details>`.

## TestExercise
Поле `testExercise` у `Task`: `{ starter, tests[{name, code}], timeoutMs?, solution? }`. Рендерится `TestExerciseView`.
Раннер (`src/engine/testharness.ts`) исполняется в Web Worker. В коде теста доступны `expect`
(`toBe, toEqual, toBeTruthy, toBeFalsy, toBeGreaterThan, toBeLessThan, toContain, toThrow`, `.not`, `.rejects.toThrow`, `.resolves.*`),
`advance(ms)` (управляемые часы), `now()`, подменённые `setTimeout/clearTimeout`. `export` в коде пользователя убирается.
Раннер проверяется vitest (`testharness.test.ts`) тем же исходником.

## DiagramCanvas
`<DiagramCanvas spec caption? />`, модель `src/engine/diagram.ts`. Узлы (`client|service|db|cache|queue`), связи (`sync` — синхронный вызов,
иначе через очередь). Клик по узлу «роняет» его; `cascade()` считает здоровье `ok | degraded | down`:
защищённый сервис (таймаут + circuit breaker) деградирует вместо падения, асинхронные связи отказ не передают.
Это **модель** простого правила, не симуляция реальной нагрузки.

## Прогресс (`src/app/migrate.ts`)
Схема версионируется (`SCHEMA`), `migrate()` приводит любые сохранённые данные к текущей версии. Новые поля: `flashcards`,
`interviewHistory`, `selfAssessment`, `stories`, `sandboxDrafts`. Ключ хранилища прежний (`nodejs-textbook:v1`).

## Проверки
`npm test` (движки), `npm run lint:content`, `npm run check:size`, `npm run e2e` (сценарии, ширины 360/390/768, axe в светлой и тёмной темах).
