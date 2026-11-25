// Получение атомарно одной командой: SET key token NX PX ttl.
async function acquire(redis, key, token, ttlMs) {
  return (await redis.cmd('SET', key, token, 'NX', 'PX', ttlMs)) === 'OK';
}

// Снятие только своей блокировки: проверка и удаление должны быть атомарными, поэтому Lua-скрипт.
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
async function release(redis, key, token) {
  return (await redis.cmd('EVAL', RELEASE, 1, key, token)) === 1;
}

module.exports = { acquire, release };
