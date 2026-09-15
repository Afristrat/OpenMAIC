#!/usr/bin/env bash
set -Eeuo pipefail

readonly service_dir='/srv/qalem-lrs'
readonly backup_dir='/var/backups/qalem-lrs'
readonly volume_name='qalem_lrs_data'
readonly container_name='qalem-lrs'

install -d -m 0700 "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/qalem-lrs-${timestamp}.tar.gz"
archive_name="$(basename "$archive")"

# Une courte pause donne un snapshot SQLite cohérent. Qalem réessaie via son outbox.
docker compose -f "$service_dir/docker-compose.production.yml" stop -t 30 lrs
cleanup() {
  docker compose -f "$service_dir/docker-compose.production.yml" up -d lrs >/dev/null
}
trap cleanup EXIT

docker run --rm \
  --mount "type=volume,src=${volume_name},dst=/data,readonly" \
  --mount "type=bind,src=${backup_dir},dst=/backup" \
  busybox:1.37.0-musl \
  sh -ceu "tar -C /data -czf /backup/${archive_name} ."

sha256sum "$archive" > "${archive}.sha256"
find "$backup_dir" -type f -name 'qalem-lrs-*.tar.gz' -mtime +30 -delete
find "$backup_dir" -type f -name 'qalem-lrs-*.tar.gz.sha256' -mtime +30 -delete
docker inspect --format '{{.State.Running}}' "$container_name" | grep -qx true
