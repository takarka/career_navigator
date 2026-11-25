// Решение: ограниченный LRU-кэш на Map (порядок вставки Map позволяет вытеснять самую давнюю запись).
const MAX = 1000;
const cache = new Map();

function expensive(key) {
  return 'result-for-' + key + '-' + 'x'.repeat(200);
}

function handle(key) {
  if (cache.has(key)) {
    const v = cache.get(key);
    cache.delete(key); // переместить в конец: «недавно использован»
    cache.set(key, v);
    return v;
  }
  const v = expensive(key);
  cache.set(key, v);
  if (cache.size > MAX) cache.delete(cache.keys().next().value); // вытеснить самый давний
  return v;
}

module.exports = { handle, size: () => cache.size };
