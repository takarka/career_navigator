// Сценарий: Четыре очереди
// Запуск: node 01-basics.cjs

console.log('script start');
setTimeout(() => {
  console.log('setTimeout');
}, 0);
Promise.resolve().then(() => {
  console.log('promise.then');
});
process.nextTick(() => {
  console.log('nextTick');
});
console.log('script end');
