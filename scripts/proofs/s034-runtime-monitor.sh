#!/usr/bin/env bash
# Read-only post-deployment window; no automatic restarts and no generated load.
set -euo pipefail
containers=(
    bcx5pxyuc9z3lt4jtyjipcqu-101651371590
    qalem-workers-a14gf0n3u719hnnd2yujrtmr-102255141634
    capture-worker-a14gf0n3u719hnnd2yujrtmr-102255155250
    qalem-lti-moodle-web-1
    qalem-lti-moodle-db-1
)
for check in $(seq 1 31); do
    for container in "${containers[@]}"; do
        state=$(docker inspect --format '{{.State.Health.Status}} {{.State.OOMKilled}} {{.RestartCount}} {{.State.Paused}}' "$container")
        if [ "$state" != 'healthy false 0 false' ]; then
            printf 'FAIL %s %s\n' "$container" "$state"
            exit 1
        fi
    done
    for url in https://qalem.ma/api/health https://lms-test.qalem.ma/login/index.php; do
        test "$(curl --max-time 20 -s -o /dev/null -w '%{http_code}' "$url")" = 200
    done
    printf '%s check=%s containers=5 healthy=true OOM=false restarts=0 HTTP=200\n' "$(date -u +%FT%TZ)" "$check"
    if [ "$check" -lt 31 ]; then sleep 30; fi
done
printf 'S034_RUNTIME_HEALTH_15MIN_OK\n'
