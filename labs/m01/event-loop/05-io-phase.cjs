// Сценарий: I/O: setTimeout против setImmediate
// Запуск: node 05-io-phase.cjs

const fs = require('node:fs');

console.log('start');
fs.readFile(__filename, () => {
  console.log('I/O callback');
  setTimeout(() => {
    console.log('setTimeout');
  }, 0);
  setImmediate(() => {
    console.log('setImmediate');
  });
  process.nextTick(() => {
    console.log('nextTick');
  });
  Promise.resolve().then(() => {
    console.log('promise');
  });
});
console.log('end');
