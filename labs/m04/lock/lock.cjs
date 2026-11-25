// ЗАДАНИЕ: распределённая блокировка на Redis.
// acquire(redis, key, token, ttlMs) -> true, если блокировка получена, иначе false.
// release(redis, key, token) -> true, если блокировка снята ИМЕННО этим владельцем (token совпал).
// Сейчас acquire делает GET, затем SET: между ними другой клиент успевает взять блокировку (гонка),
// а release снимает чужую блокировку. Проверка: npm test
async function acquire(redis, key, token, ttlMs) {
  const cur = await redis.cmd('GET', key);
  if (cur !== null) return false;
  await redis.cmd('SET', key, token, 'PX', ttlMs);
  return true;
}

async function release(redis, key, token) {
  await redis.cmd('DEL', key);
  return true;
}

module.exports = { acquire, release };
