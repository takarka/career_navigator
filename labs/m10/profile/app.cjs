// Лаборатория: CPU-профиль. Скрипт делает три вещи с разной стоимостью; задача — найти по профилю, какая из них «горячая».
// Запуск с профилированием:  node --cpu-prof --cpu-prof-dir=./prof app.cjs
// Профиль (.cpuprofile) можно открыть в Chrome DevTools (вкладка Performance / «Load profile») или загрузить в учебник.
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2); // экспоненциальная рекурсия: основная трата CPU
}

function parseJson(n) {
  const s = JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: i, name: 'item-' + i })));
  let total = 0;
  for (let i = 0; i < n; i++) total += JSON.parse(s).length;
  return total;
}

function cheap(n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += i % 7;
  return s;
}

const t0 = Date.now();
fib(37);
parseJson(30);
cheap(2e6);
console.log(`готово за ${Date.now() - t0} мс`);
