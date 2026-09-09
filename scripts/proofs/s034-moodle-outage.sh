#!/usr/bin/env bash
# Real outage limited to the explicitly authorised, synthetic-data Moodle.
set -euo pipefail
runner=qalem-refork-exec
lms=qalem-lti-moodle-web-1
database=supabase-db-lkqqmwsn5zydykuv3gd6q7ws
workspace=/workspace/.codex-gate-s3-008-fe6ebba
docker exec "$runner" test ! -e /tmp/s034-lti-outage-ready
docker exec "$runner" test ! -e /tmp/s034-lti-outage-submit
test "$(docker inspect --format '{{.State.Health.Status}} {{.State.Paused}}' "$lms")" = 'healthy false'
paused=false
restore() {
    if "$paused"; then docker unpause "$lms" >/dev/null; fi
}
trap restore EXIT
export LTI_TEST_LEARNER=a LTI_TEST_OUTAGE=true
export LTI_TEST_PASSWORD="$(docker exec "$lms" cat /var/www/moodledata/.qalem-lti-secrets/learner_a)"
docker exec -e LTI_TEST_LEARNER -e LTI_TEST_PASSWORD -e LTI_TEST_OUTAGE -w "$workspace" "$runner" node scripts/proofs/s034-moodle-quiz.mjs &
browser_pid=$!
ready=false
for check in $(seq 1 60); do
    if docker exec "$runner" test -e /tmp/s034-lti-outage-ready; then ready=true; break; fi
    kill -0 "$browser_pid"
    sleep 1
done
"$ready"
docker pause "$lms" >/dev/null
paused=true
docker exec "$runner" touch /tmp/s034-lti-outage-submit
wait "$browser_pid"
failed_attempt=false
for check in $(seq 1 45); do
    state=$(docker exec "$database" psql -U postgres -d postgres -Atc "SELECT status||'|'||attempt_count||'|'||coalesce(last_error,'') FROM public.lti_grade_outbox WHERE client_id='P2w5UO5AktgXaHj' AND score=0 ORDER BY sequence DESC LIMIT 1")
    if [[ "$state" == pending\|[1-9]* ]]; then failed_attempt=true; printf 'S034_REAL_OUTAGE_OBSERVED %s\n' "$state"; break; fi
    sleep 2
done
"$failed_attempt"
restore
paused=false
printf 'S034_MOODLE_UNPAUSED\n'
