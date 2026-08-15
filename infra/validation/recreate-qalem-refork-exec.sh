#!/usr/bin/env sh
set -eu

container_name='qalem-refork-exec'
image_name='qalem-validation:playwright-1.58.2-ffmpeg'
workspace='/home/serveuria/qalem-refork-v030'
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker build --tag "$image_name" "$script_dir"

if docker container inspect "$container_name" >/dev/null 2>&1; then
  docker stop "$container_name" >/dev/null
  docker rm "$container_name" >/dev/null
fi

docker run --detach \
  --name "$container_name" \
  --init \
  --memory 10g \
  --cpus 4 \
  --volume "$workspace:/workspace" \
  --workdir /workspace \
  "$image_name" \
  tail -f /dev/null >/dev/null

docker inspect "$container_name" \
  --format '{{.State.Status}} {{.Config.Image}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}'
docker exec "$container_name" sh -lc 'ps -p 1 -o pid=,comm=,args=; pnpm --version; ffmpeg -version | head -n 1'
