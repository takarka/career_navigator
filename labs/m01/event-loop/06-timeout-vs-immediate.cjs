// Сценарий: setTimeout(0) против setImmediate в основном модуле
// Запуск: node 06-timeout-vs-immediate.cjs

setTimeout(() => {
  console.log('setTimeout');
}, 0);
setImmediate(() => {
  console.log('setImmediate');
});
