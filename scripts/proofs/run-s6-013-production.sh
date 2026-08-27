#!/usr/bin/env bash
set -Eeuo pipefail

: "${PROOF_WEB_CONTAINER:?PROOF_WEB_CONTAINER is required}"
: "${PROOF_APP_SHA:?PROOF_APP_SHA is required}"

PROOF_BASE_URL="${PROOF_BASE_URL:-https://qalem.ma}"
PROOF_WORKTREE="${PROOF_WORKTREE:-/tmp/qalem-s6013-155f9b3}"
PROOF_GATE_IMAGE="${PROOF_GATE_IMAGE:-qalem-s6017-gate:ffmpeg}"
PROOF_HARNESS_SHA="${PROOF_HARNESS_SHA:-$(git -C "$PROOF_WORKTREE" rev-parse HEAD)}"
PROOF_MARKER="${PROOF_MARKER:-s6013-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
PROOF_ARTIFACT_DIR="${PROOF_ARTIFACT_DIR:-/tmp/qalem-s6013-artifacts/$PROOF_MARKER}"
PROOF_EMAIL="${PROOF_EMAIL:-$PROOF_MARKER@qalem.invalid}"
PROOF_PASSWORD="${PROOF_PASSWORD:-$(openssl rand -hex 24)}"

mkdir -p "$PROOF_ARTIFACT_DIR"

PROOF_USER_ID="$({
  docker exec -i \
    -e PROOF_EMAIL="$PROOF_EMAIL" \
    -e PROOF_PASSWORD="$PROOF_PASSWORD" \
    "$PROOF_WEB_CONTAINER" node --input-type=module
} <<'NODE'
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Supabase admin configuration is unavailable');
const response = await fetch(`${baseUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    email: process.env.PROOF_EMAIL,
    password: process.env.PROOF_PASSWORD,
    email_confirm: true,
    user_metadata: { purpose: 'S6-013 production proof' },
  }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok || typeof body.id !== 'string') {
  throw new Error(`Temporary Auth identity creation failed with HTTP ${response.status}`);
}
process.stdout.write(body.id);
NODE
)"

if [[ ! "$PROOF_USER_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  echo '[COORDINATOR] Temporary Auth identity did not return a UUID' >&2
  exit 1
fi

audit_or_cleanup() {
  local mode="$1"
  docker exec -i \
    -e AUDIT_MODE="$mode" \
    -e PROOF_USER_ID="$PROOF_USER_ID" \
    -e PROOF_MARKER="$PROOF_MARKER" \
    -e PROOF_CLASSROOM_ID="${PROOF_CLASSROOM_ID:-}" \
    -e PROOF_SHORT_CODE="${PROOF_SHORT_CODE:-}" \
    "$PROOF_WEB_CONTAINER" node --input-type=module <<'NODE'
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Supabase admin configuration is unavailable');
const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
const jsonHeaders = { ...headers, 'content-type': 'application/json' };
const userId = process.env.PROOF_USER_ID;
const marker = process.env.PROOF_MARKER;
const classroomId = process.env.PROOF_CLASSROOM_ID;
const shortCode = process.env.PROOF_SHORT_CODE;

async function rows(table, query) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) throw new Error(`${table} audit failed with HTTP ${response.status}`);
  return response.json();
}

async function removeRows(table, query) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=minimal' },
  });
  if (!response.ok) throw new Error(`${table} cleanup failed with HTTP ${response.status}`);
}

async function listStorage(prefix) {
  const response = await fetch(`${baseUrl}/storage/v1/object/list/classroom-media`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!response.ok) throw new Error(`Storage audit failed with HTTP ${response.status}`);
  return response.json();
}

async function classroomPaths(prefix) {
  if (!prefix) return [];
  const entries = await listStorage(prefix);
  const paths = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) paths.push(...(await classroomPaths(path)));
    else paths.push(path);
  }
  return paths;
}

async function shortLinkPresent() {
  if (!shortCode) return false;
  const response = await fetch(
    `${baseUrl}/storage/v1/object/authenticated/classroom-media/short-links/${shortCode}.json`,
    { headers },
  );
  return response.ok;
}

async function audit() {
  const [auth, organizations, stages, paths, linkPresent] = await Promise.all([
    fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { headers }),
    rows('organizations', `name=eq.${encodeURIComponent(`S6-013 ${marker}`)}&select=id`),
    rows('stages', `owner_id=eq.${encodeURIComponent(userId)}&select=id`),
    classroomPaths(classroomId),
    shortLinkPresent(),
  ]);
  return {
    authExists: auth.ok,
    organizationCount: organizations.length,
    stageCount: stages.length,
    shortLinkPresent: linkPresent,
    classroomFileCount: paths.length,
  };
}

if (process.env.AUDIT_MODE === 'cleanup') {
  const paths = await classroomPaths(classroomId);
  if (shortCode) paths.push(`short-links/${shortCode}.json`);
  if (paths.length > 0) {
    const storageResponse = await fetch(`${baseUrl}/storage/v1/object/classroom-media`, {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ prefixes: [...new Set(paths)] }),
    });
    if (!storageResponse.ok) {
      throw new Error(`Storage cleanup failed with HTTP ${storageResponse.status}`);
    }
  }
  if (classroomId) await removeRows('stages', `id=eq.${encodeURIComponent(classroomId)}`);
  await removeRows('organizations', `name=eq.${encodeURIComponent(`S6-013 ${marker}`)}`);
  const userResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers,
  });
  if (!userResponse.ok && userResponse.status !== 404) {
    throw new Error(`Auth cleanup failed with HTTP ${userResponse.status}`);
  }
}

process.stdout.write(JSON.stringify(await audit()));
NODE
}

echo "[COORDINATOR] marker=$PROOF_MARKER"
echo "[COORDINATOR] artifact_dir=$PROOF_ARTIFACT_DIR"

set +e
docker run --rm --init --shm-size=2g \
  -v "$PROOF_WORKTREE:/workspace" \
  -v "$PROOF_ARTIFACT_DIR:$PROOF_ARTIFACT_DIR" \
  -w /workspace \
  -e PROOF_BASE_URL="$PROOF_BASE_URL" \
  -e PROOF_EMAIL="$PROOF_EMAIL" \
  -e PROOF_PASSWORD="$PROOF_PASSWORD" \
  -e PROOF_MARKER="$PROOF_MARKER" \
  -e PROOF_ARTIFACT_DIR="$PROOF_ARTIFACT_DIR" \
  -e PROOF_SHA="$PROOF_APP_SHA" \
  -e PROOF_HARNESS_SHA="$PROOF_HARNESS_SHA" \
  "$PROOF_GATE_IMAGE" sh -lc \
  'mkdir -p /tmp/corepack-bin; corepack enable --install-directory /tmp/corepack-bin >/dev/null; export PATH=/tmp/corepack-bin:/usr/bin:/bin; pnpm exec tsx scripts/proofs/s6-013-production.ts'
proof_exit=$?
set -e

if [[ -f "$PROOF_ARTIFACT_DIR/evidence.json" ]]; then
  PROOF_CLASSROOM_ID="$(jq -r '.generation.classroomId // empty' "$PROOF_ARTIFACT_DIR/evidence.json")"
  PROOF_SHORT_CODE="$(jq -r '.workbook.shortCode // empty' "$PROOF_ARTIFACT_DIR/evidence.json")"
fi
export PROOF_CLASSROOM_ID PROOF_SHORT_CODE

pre_fallback_audit="$(audit_or_cleanup audit)"
echo "[COORDINATOR] pre_fallback_audit=$pre_fallback_audit"
residue_before_fallback="$(jq -nr --argjson audit "$pre_fallback_audit" \
  '$audit.authExists or ($audit.organizationCount > 0) or ($audit.stageCount > 0) or $audit.shortLinkPresent or ($audit.classroomFileCount > 0)')"

if [[ "$residue_before_fallback" == true ]]; then
  audit_or_cleanup cleanup >/dev/null
fi

post_fallback_audit="$(audit_or_cleanup audit)"
echo "[COORDINATOR] post_fallback_audit=$post_fallback_audit"
post_residue="$(jq -nr --argjson audit "$post_fallback_audit" \
  '$audit.authExists or ($audit.organizationCount > 0) or ($audit.stageCount > 0) or $audit.shortLinkPresent or ($audit.classroomFileCount > 0)')"

unset PROOF_PASSWORD
echo "[COORDINATOR] proof_exit=$proof_exit"
echo "[COORDINATOR] residue_before_fallback=$residue_before_fallback"

if [[ "$post_residue" == true ]]; then
  exit 2
fi
exit "$proof_exit"
