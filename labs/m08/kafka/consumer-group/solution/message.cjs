// Решение: ключ = идентификатор пользователя. Стандартный партиционер считает murmur2(ключ) % число_партиций.
function toKafkaMessage(event) {
  return { key: event.userId, value: JSON.stringify(event) };
}

module.exports = { toKafkaMessage };
