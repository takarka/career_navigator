// Сценарий: nextTick и промисы друг в друге
// Запуск: node 03-tick-vs-promise.cjs

Promise.resolve().then(() => {
  console.log('promise 1');
  process.nextTick(() => {
    console.log('nextTick внутри promise');
  });
});
process.nextTick(() => {
  console.log('nextTick 1');
  Promise.resolve().then(() => {
    console.log('promise внутри nextTick');
  });
});
console.log('sync');
