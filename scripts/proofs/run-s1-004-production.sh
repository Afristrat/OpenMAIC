#!/usr/bin/env bash
set -Eeuo pipefail

: "${PROOF_WEB_CONTAINER:?PROOF_WEB_CONTAINER is required}"
: "${PROOF_APP_SHA:?PROOF_APP_SHA is required}"

PROOF_BASE_URL="${PROOF_BASE_URL:-https://qalem.ma}"
PROOF_WORKTREE="${PROOF_WORKTREE:-/tmp/qalem-s6013-155f9b3}"
PROOF_GATE_IMAGE="${PROOF_GATE_IMAGE:-qalem-validation:playwright-1.58.2-ffmpeg}"
PROOF_HARNESS_SHA="${PROOF_HARNESS_SHA:-$(git -C "$PROOF_WORKTREE" rev-parse HEAD)}"
PROOF_MARKER="${PROOF_MARKER:-s1004-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"
PROOF_ARTIFACT_DIR="${PROOF_ARTIFACT_DIR:-/tmp/qalem-s1004-artifacts/$PROOF_MARKER}"
PROOF_EMAIL="$PROOF_MARKER@qalem.invalid"
PROOF_PASSWORD="$(openssl rand -hex 24)"
PROOF_CLASSROOM_ID="${PROOF_MARKER//[^A-Za-z0-9_-]/_}-classroom"
PROOF_SCENE_ID="$PROOF_CLASSROOM_ID-scene"
PROOF_COURSE_TITLE="Catalogue réel $PROOF_MARKER"

mkdir -p "$PROOF_ARTIFACT_DIR"

fixture="$({
  docker exec -i \
    -e PROOF_EMAIL="$PROOF_EMAIL" \
    -e PROOF_PASSWORD="$PROOF_PASSWORD" \
    -e PROOF_MARKER="$PROOF_MARKER" \
    -e PROOF_CLASSROOM_ID="$PROOF_CLASSROOM_ID" \
    -e PROOF_SCENE_ID="$PROOF_SCENE_ID" \
    -e PROOF_COURSE_TITLE="$PROOF_COURSE_TITLE" \
    "$PROOF_WEB_CONTAINER" node --input-type=module
} <<'NODE'
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Supabase admin configuration is unavailable');
const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function request(path, method, body, prefer = 'return=representation') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...headers, prefer },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
  return payload;
}

let userId;
let organizationId;
try {
  const user = await request('/auth/v1/admin/users', 'POST', {
    email: process.env.PROOF_EMAIL,
    password: process.env.PROOF_PASSWORD,
    email_confirm: true,
    user_metadata: { purpose: 'S1-004 production proof' },
  });
  if (typeof user?.id !== 'string') throw new Error('Temporary user creation returned no UUID');
  userId = user.id;

  const [organization] = await request('/rest/v1/organizations', 'POST', {
    name: `S1-004 ${process.env.PROOF_MARKER}`,
    sector: 'education',
    default_locale: 'fr-FR',
  });
  organizationId = organization.id;
  await request('/rest/v1/org_members', 'POST', {
    user_id: userId,
    org_id: organizationId,
    role: 'admin',
  });
  await request('/rest/v1/stages', 'POST', {
    id: process.env.PROOF_CLASSROOM_ID,
    owner_id: userId,
    org_id: organizationId,
    name: process.env.PROOF_COURSE_TITLE,
    description: 'Fixture isolée de recette S1-004',
    language: 'fr-FR',
    style: 'professional',
    extra: { createdAt: Date.now(), updatedAt: Date.now() },
  });
  await request('/rest/v1/scenes', 'POST', {
    id: process.env.PROOF_SCENE_ID,
    stage_id: process.env.PROOF_CLASSROOM_ID,
    type: 'slide',
    title: 'Bienvenue dans la formation',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: `${process.env.PROOF_SCENE_ID}-canvas`,
        viewportSize: 1000,
        viewportRatio: 0.5625,
        elements: [],
        background: { type: 'solid', color: '#ffffff' },
      },
    },
    actions: [],
    extra: { createdAt: Date.now(), updatedAt: Date.now() },
  });
  const [course] = await request('/rest/v1/courses', 'POST', {
    owner_id: userId,
    org_id: organizationId,
    stage_id: process.env.PROOF_CLASSROOM_ID,
    title: process.env.PROOF_COURSE_TITLE,
    language: 'fr-FR',
    source_kind: 'generated',
    outline: { scenes: [] },
    status: 'ready',
    catalog_visible: false,
  });
  process.stdout.write(JSON.stringify({ userId, organizationId, courseId: course.id }));
} catch (error) {
  if (organizationId) {
    await fetch(`${baseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }
  if (userId) {
    await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }
  throw error;
}
NODE
)"

PROOF_USER_ID="$(jq -r '.userId' <<<"$fixture")"
PROOF_ORGANIZATION_ID="$(jq -r '.organizationId' <<<"$fixture")"
PROOF_COURSE_ID="$(jq -r '.courseId' <<<"$fixture")"

audit_or_cleanup() {
  local mode="$1"
  docker exec -i \
    -e AUDIT_MODE="$mode" \
    -e PROOF_USER_ID="$PROOF_USER_ID" \
    -e PROOF_ORGANIZATION_ID="$PROOF_ORGANIZATION_ID" \
    -e PROOF_COURSE_ID="$PROOF_COURSE_ID" \
    -e PROOF_CLASSROOM_ID="$PROOF_CLASSROOM_ID" \
    "$PROOF_WEB_CONTAINER" node --input-type=module <<'NODE'
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Supabase admin configuration is unavailable');
const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };

async function rows(table, query) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) throw new Error(`${table} audit failed with HTTP ${response.status}`);
  return response.json();
}
async function remove(table, query) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=minimal' },
  });
  if (!response.ok) throw new Error(`${table} cleanup failed with HTTP ${response.status}`);
}

if (process.env.AUDIT_MODE === 'cleanup') {
  await remove('courses', `id=eq.${encodeURIComponent(process.env.PROOF_COURSE_ID)}`);
  await remove('stages', `id=eq.${encodeURIComponent(process.env.PROOF_CLASSROOM_ID)}`);
  await remove('organizations', `id=eq.${encodeURIComponent(process.env.PROOF_ORGANIZATION_ID)}`);
  const response = await fetch(`${baseUrl}/auth/v1/admin/users/${process.env.PROOF_USER_ID}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Auth cleanup failed with HTTP ${response.status}`);
  }
}

const [auth, courses, stages, organizations] = await Promise.all([
  fetch(`${baseUrl}/auth/v1/admin/users/${process.env.PROOF_USER_ID}`, { headers }),
  rows('courses', `id=eq.${encodeURIComponent(process.env.PROOF_COURSE_ID)}&select=id`),
  rows('stages', `id=eq.${encodeURIComponent(process.env.PROOF_CLASSROOM_ID)}&select=id`),
  rows('organizations', `id=eq.${encodeURIComponent(process.env.PROOF_ORGANIZATION_ID)}&select=id`),
]);
process.stdout.write(JSON.stringify({
  authExists: auth.ok,
  courseCount: courses.length,
  stageCount: stages.length,
  organizationCount: organizations.length,
}));
NODE
}

set +e
docker run --rm --init --shm-size=2g \
  -v "$PROOF_WORKTREE:/workspace" \
  -v "$PROOF_ARTIFACT_DIR:$PROOF_ARTIFACT_DIR" \
  -w /workspace \
  -e PROOF_BASE_URL="$PROOF_BASE_URL" \
  -e PROOF_EMAIL="$PROOF_EMAIL" \
  -e PROOF_PASSWORD="$PROOF_PASSWORD" \
  -e PROOF_COURSE_ID="$PROOF_COURSE_ID" \
  -e PROOF_CLASSROOM_ID="$PROOF_CLASSROOM_ID" \
  -e PROOF_COURSE_TITLE="$PROOF_COURSE_TITLE" \
  -e PROOF_ARTIFACT_DIR="$PROOF_ARTIFACT_DIR" \
  -e PROOF_APP_SHA="$PROOF_APP_SHA" \
  -e PROOF_HARNESS_SHA="$PROOF_HARNESS_SHA" \
  "$PROOF_GATE_IMAGE" sh -lc \
  'mkdir -p /tmp/corepack-bin; corepack enable --install-directory /tmp/corepack-bin >/dev/null; export PATH=/tmp/corepack-bin:/usr/bin:/bin; pnpm exec tsx scripts/proofs/s1-004-production.ts'
proof_exit=$?
set -e

pre_cleanup_audit="$(audit_or_cleanup audit)"
audit_or_cleanup cleanup >/dev/null
post_cleanup_audit="$(audit_or_cleanup audit)"
unset PROOF_PASSWORD

echo "[S1-004] artifact_dir=$PROOF_ARTIFACT_DIR"
echo "[S1-004] proof_exit=$proof_exit"
echo "[S1-004] pre_cleanup_audit=$pre_cleanup_audit"
echo "[S1-004] post_cleanup_audit=$post_cleanup_audit"

post_residue="$(jq -nr --argjson audit "$post_cleanup_audit" \
  '$audit.authExists or ($audit.courseCount > 0) or ($audit.stageCount > 0) or ($audit.organizationCount > 0)')"
if [[ "$post_residue" == true ]]; then
  exit 2
fi
exit "$proof_exit"
