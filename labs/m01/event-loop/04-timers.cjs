// Сценарий: Таймеры и микрозадачи между ними
// Запуск: node 04-timers.cjs

setTimeout(() => {
  console.log('timeout 10');
}, 10);
setTimeout(() => {
  console.log('timeout 0');
  Promise.resolve().then(() => {
    console.log('promise в timeout 0');
  });
}, 0);
setTimeout(() => {
  console.log('timeout 0 (второй)');
}, 0);
Promise.resolve()
  .then(() => {
    console.log('then 1');
  })
  .then(() => {
    console.log('then 2');
  });
console.log('sync');
