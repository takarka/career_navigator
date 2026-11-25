#!/usr/bin/env bash
# Дымовая проверка общих сервисов лабораторий: поднимает их, ждёт healthcheck, останавливает.
# Запуск из корня репозитория: bash labs/scripts/smoke.sh [сервис ...]
set -euo pipefail

cd "$(dirname "$0")/.."
SERVICES=("$@")
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(postgres redis rabbitmq kafka)

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker compose up -d --wait --wait-timeout 180 "${SERVICES[@]}"

for s in "${SERVICES[@]}"; do
  case "$s" in
    postgres) docker compose exec -T postgres psql -U lab -d lab -tAc 'select 1' ;;
    redis) docker compose exec -T redis redis-cli ping ;;
    rabbitmq) docker compose exec -T rabbitmq rabbitmq-diagnostics -q ping ;;
    kafka) docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list >/dev/null && echo "kafka ok" ;;
  esac
  echo "OK: $s"
done
