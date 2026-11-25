#!/usr/bin/env bash
# Проверка лабораторий модуля 8 на живых брокерах: заготовка должна падать (код 1), решение проходить (код 0).
# Запуск из корня репозитория: bash labs/scripts/run-broker-labs.sh
# Этот сценарий ещё НЕ запускался: в среде разработки не было Docker-демона. Первый реальный прогон — в CI (oracle.yml).
set -uo pipefail
cd "$(dirname "$0")/.."

trap 'docker compose down -v >/dev/null 2>&1 || true' EXIT
docker compose up -d --wait --wait-timeout 240 rabbitmq kafka || { echo "не удалось поднять брокеры"; exit 1; }

failed=0
check() { # лаборатория, ожидаемый код для заготовки
  local dir="$1"
  (cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1)
  (cd "$dir" && npm test >/tmp/starter.log 2>&1); local s=$?
  (cd "$dir" && npm run test:solution >/tmp/solution.log 2>&1); local r=$?
  if [ "$s" -ne 1 ]; then echo "ОШИБКА $dir: заготовка должна падать (код 1), получен $s"; cat /tmp/starter.log; failed=1; fi
  if [ "$r" -ne 0 ]; then echo "ОШИБКА $dir: решение должно проходить (код 0), получен $r"; cat /tmp/solution.log; failed=1; fi
  [ "$s" -eq 1 ] && [ "$r" -eq 0 ] && echo "OK $dir"
}

check m08/rabbitmq/basic
check m08/rabbitmq/retry-dlq
check m08/kafka/consumer-group
exit $failed
