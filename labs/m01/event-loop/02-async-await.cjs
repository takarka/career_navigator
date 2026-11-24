// Сценарий: async/await
// Запуск: node 02-async-await.cjs

console.log('script start');
(async () => {
  console.log('f: до await');
  await null;
  console.log('f: после await');
})();
Promise.resolve().then(() => {
  console.log('promise.then');
});
console.log('script end');
