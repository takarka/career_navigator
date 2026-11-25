// Измерение задержки event loop через perf_hooks.monitorEventLoopDelay.
// Запуск: node lag.cjs
const { monitorEventLoopDelay } = require('node:perf_hooks');

const h = monitorEventLoopDelay({ resolution: 10 }); // опрос каждые ~10 мс
h.enable();

setTimeout(() => {
  const end = Date.now() + 300; // блокируем цикл на 300 мс
  while (Date.now() < end);
}, 100);

setTimeout(() => {
  h.disable();
  const ms = (ns) => (ns / 1e6).toFixed(1);
  console.log(`min=${ms(h.min)} мс  p50=${ms(h.percentile(50))} мс  p99=${ms(h.percentile(99))} мс  max=${ms(h.max)} мс`);
}, 700);
