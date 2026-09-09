#!/bin/sh
# Bounded post-deployment observation. No load generation and no automatic repair.
set -eu
for check in $(seq 1 31); do
    for container in qalem-lti-moodle-web-1 qalem-lti-moodle-db-1; do
        state=$(docker inspect --format '{{.State.Health.Status}} {{.State.OOMKilled}} {{.RestartCount}}' "$container")
        if [ "$state" != 'healthy false 0' ]; then
            printf 'FAIL %s %s\n' "$container" "$state"
            exit 1
        fi
    done
    moodle=$(curl --max-time 20 -s -o /dev/null -w '%{http_code}' https://lms-test.qalem.ma/login/index.php)
    qalem=$(curl --max-time 20 -s -o /dev/null -w '%{http_code}' https://qalem.ma/api/health)
    if [ "$moodle" != 200 ] || [ "$qalem" != 200 ]; then
        printf 'FAIL HTTP Moodle=%s Qalem=%s\n' "$moodle" "$qalem"
        exit 1
    fi
    printf '%s check=%s Moodle=200 Qalem=200 healthy=true OOM=false restarts=0\n' "$(date -u +%FT%TZ)" "$check"
    if [ "$check" -lt 31 ]; then sleep 30; fi
done
printf 'S034_MOODLE_HEALTH_15MIN_OK\n'
