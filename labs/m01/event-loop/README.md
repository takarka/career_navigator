# Лаборатория: event loop

Файлы сгенерированы из сценариев учебника (`npm run gen:labs`). Не правь их вручную.

1. Сначала предскажи вывод каждого файла.
2. Затем запусти его: `node 01-basics.cjs`.
3. Сверься с порядком в модели ниже (раскрой нужный пункт).

Автотесты проекта (`npm test`) запускают те же сценарии в реальном Node и сравнивают с моделью.

<details><summary><code>01-basics.cjs</code> — Четыре очереди</summary>

Порядок в модели: script start → script end → nextTick → promise.then → setTimeout

</details>

<details><summary><code>02-async-await.cjs</code> — async/await</summary>

Порядок в модели: script start → f: до await → script end → f: после await → promise.then

</details>

<details><summary><code>03-tick-vs-promise.cjs</code> — nextTick и промисы друг в друге</summary>

Порядок в модели: sync → nextTick 1 → promise 1 → promise внутри nextTick → nextTick внутри promise

</details>

<details><summary><code>04-timers.cjs</code> — Таймеры и микрозадачи между ними</summary>

Порядок в модели: sync → then 1 → then 2 → timeout 0 → promise в timeout 0 → timeout 0 (второй) → timeout 10

</details>

<details><summary><code>05-io-phase.cjs</code> — I/O: setTimeout против setImmediate</summary>

Порядок в модели: start → end → I/O callback → nextTick → promise → setImmediate → setTimeout

</details>

<details><summary><code>06-timeout-vs-immediate.cjs</code> — setTimeout(0) против setImmediate в основном модуле (порядок не гарантирован)</summary>

Порядок в модели: setTimeout → setImmediate

</details>
