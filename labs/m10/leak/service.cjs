// Лаборатория: утечка памяти. Сервис кэширует результат дорогого расчёта по ключу запроса.
// ЗАДАНИЕ: найди причину роста памяти и исправь так, чтобы кэш был ограничен по размеру (например, LRU на 1000 записей),
// а результат остался тем же. Проверка: npm test
const cache = new Map();

function expensive(key) {
  return 'result-for-' + key + '-' + 'x'.repeat(200);
}

function handle(key) {
  if (cache.has(key)) return cache.get(key);
  const v = expensive(key);
  cache.set(key, v); // ← записи накапливаются без ограничения, ключи уникальны
  return v;
}

module.exports = { handle, size: () => cache.size };
