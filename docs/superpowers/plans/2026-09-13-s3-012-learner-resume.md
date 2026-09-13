# S3-012 Learner Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relancer un apprenant ayant interrompu une formation vers sa scène et son activité réellement enregistrées, sans confondre cette reprise avec la récupération du plan par son auteur.

**Architecture:** La progression appartient à un apprenant, un cours et une organisation ; elle est écrite par une RPC transactionnelle qui refuse toute cible hors tenant. Une seconde table durable porte les relances et leur clé de déduplication. Le worker existant les recontrôle juste avant l’envoi, réutilise le budget de sollicitation et envoie un lien interne qui sera revalidé après connexion.

**Tech Stack:** Next.js 16, TypeScript, Supabase/PostgreSQL RLS et fonctions `SECURITY INVOKER`, BullMQ, Web Push, Vitest et Playwright.

**Spec:** `.ralph/prd-v3.json#S3-012`

## Global Constraints

- FR, AR-MA RTL et EN-US passent par `t()` ; aucune chaîne UI non localisée.
- Aucune URL externe, aucun identifiant de tenant ou de session non vérifié ne peut devenir une cible de reprise.
- RLS reste activé sur toute nouvelle table ; l’écriture privilégiée est une RPC autorisant uniquement l’apprenant concerné.
- Une relance ne révèle ni titre de formation ni contenu de discussion sur l’écran verrouillé.
- Les notifications respectent `review_notification_preferences`, `shouldDeferDelivery` et `claim_notification_delivery_slot`.
- Aucun nouveau paquet ; réutiliser BullMQ, les routes internes et Web Push existants.
- Les tests et l’exécution applicative sont effectués sur ServeurIA.

---

### Task 1: Persistance et invariants de reprise

**Files:**

- Create: `supabase/migrations/20260913110000_learner_course_resume.sql`
- Modify: `lib/supabase/types.ts`
- Test: `scripts/proofs/s3012-resume.sql`

**Interfaces:**

- Produces `public.record_learner_course_resume(p_course uuid, p_org uuid, p_scene uuid, p_activity text, p_state jsonb, p_position_ms integer)`.
- Produces `public.resolve_learner_course_resume(p_course uuid, p_org uuid)`.
- Produces `public.claim_due_course_resume_deliveries(p_now timestamptz)`.
- Produces tables `learner_course_resumes` and `course_resume_deliveries`.

- [ ] **Step 1: Write the failing SQL proof**

```sql
SELECT public.record_learner_course_resume(:course, :org, :scene, 'quiz', '{"draftAnswer":"B"}'::jsonb, 12000);
SELECT public.resolve_learner_course_resume(:course, :org);
-- Assert the returned user, tenant, scene, activity and 12000 ms position.
-- Assert a second tenant, a second learner and a deleted scene are rejected.
```

- [ ] **Step 2: Run the SQL proof against an isolated PostgreSQL 17 instance**

Run: `docker run --rm --network none -v "$PWD:/workspace" postgres:17 psql -f /workspace/scripts/proofs/s3012-resume.sql`

Expected: failure because no learner resume RPC exists.

- [ ] **Step 3: Add the migration**

```sql
CREATE TABLE public.learner_course_resumes (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  activity text NOT NULL CHECK (activity IN ('scene','discussion','quiz','resource')),
  activity_state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(activity_state)='object'),
  position_ms integer NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  completed_at timestamptz,
  abandoned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
```

Add a `course_resume_deliveries` table keyed by `(course_id, user_id, dedupe_key)`, with `scheduled_for`, `sent_at`, `opened_at`, `cancelled_at`, `attempt_count` and a foreign key to the resume row. Its trigger cancels unsent rows when `completed_at`, `abandoned_at`, tenant membership, course publication or scene validity cease to hold. Enable RLS and provide only owner `SELECT`; revoke every mutating table privilege from `authenticated`.

- [ ] **Step 4: Add transactional RPCs and generated types**

```sql
-- record_learner_course_resume verifies auth.uid(), active membership, scene ownership
-- and course scope under FOR SHARE, then upserts the position without changing a
-- completed or abandoned row. resolve_learner_course_resume returns NULL rather
-- than leaking a withdrawn target.
```

Regenerate the affected explicit entries in `lib/supabase/types.ts`; do not introduce `any`.

- [ ] **Step 5: Re-run the SQL proof**

Run: `docker run --rm --network none -v "$PWD:/workspace" postgres:17 psql -v ON_ERROR_STOP=1 -f /workspace/scripts/proofs/s3012-resume.sql`

Expected: success, including cross-user and cross-tenant denial.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260913110000_learner_course_resume.sql lib/supabase/types.ts scripts/proofs/s3012-resume.sql
git commit -m "[S3-012] Relancer les formations inachevées et reprendre au bon endroit"
```

### Task 2: Boundary API and internal resume target

**Files:**

- Create: `lib/server/learner-course-resume.ts`
- Create: `app/api/learner-courses/[courseId]/resume/route.ts`
- Create: `app/api/learner-courses/[courseId]/resume-target/route.ts`
- Test: `tests/server/learner-course-resume.test.ts`

**Interfaces:**

- Consumes the three Task 1 RPCs.
- Produces `saveLearnerCourseResume(input)` and `resolveLearnerCourseResume(input)`.
- `POST /api/learner-courses/:courseId/resume` accepts `{orgId,sceneId,activity,activityState,positionMs}`.
- `GET /api/learner-courses/:courseId/resume-target?orgId=<uuid>` returns only `{sceneId,activity,activityState,positionMs}`.

- [ ] **Step 1: Write failing server tests**

```ts
expect(await saveLearnerCourseResume(fixture)).toEqual({ saved: true });
await expect(saveLearnerCourseResume(otherTenantFixture)).rejects.toMatchObject({ code: 'FORBIDDEN' });
expect(await resolveLearnerCourseResume(withdrawnFixture)).toBeNull();
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm exec vitest run tests/server/learner-course-resume.test.ts`

Expected: failure because the module and routes do not exist.

- [ ] **Step 3: Implement the server module and routes**

Validate UUIDs and the four activity values with Zod. Require authentication and exact same-origin POSTs. Call the Task 1 RPCs through the service client only after binding `auth.user.id`; translate `42501` to 403 and absent/withdrawn targets to a non-revealing 404. Set `Cache-Control: private, no-store` on both responses.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm exec vitest run tests/server/learner-course-resume.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/server/learner-course-resume.ts app/api/learner-courses tests/server/learner-course-resume.test.ts
git commit -m "[S3-012] Relancer les formations inachevées et reprendre au bon endroit"
```

### Task 3: Durable scheduling and worker delivery

**Files:**

- Modify: `lib/jobs/queue.ts`
- Modify: `lib/jobs/workers.ts`
- Modify: `lib/server/notification-delivery-policy.ts`
- Test: `tests/jobs/course-resume-delivery.test.ts`

**Interfaces:**

- Produces `enqueueCourseResumeDelivery({ deliveryId })` and `configureCourseResumeDeliveryScheduler()`.
- Consumes `claim_due_course_resume_deliveries`, `shouldDeferDelivery` and `claimNotificationDeliverySlot`.

- [ ] **Step 1: Write failing worker tests**

```ts
expect(await deliverDueResume(oneIncompleteCourse)).toEqual('sent');
expect(await deliverDueResume(completedAfterEnqueue)).toEqual('cancelled');
expect(await deliverDueResume(duplicateJob)).toEqual('deduplicated');
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm exec vitest run tests/jobs/course-resume-delivery.test.ts`

Expected: failure because no course-resume queue exists.

- [ ] **Step 3: Implement one queue and one worker branch**

Use queue name `course-resume-delivery`. The periodic scan claims due deliveries atomically; the delivery branch rereads completion, abandonment, active membership and scene scope before invoking `sendWebPushToUser`. Its lock-screen payload is exactly title `Qalem` and body `Une activité vous attend.`; `targetUrl` is an internal `/app?resumeCourseId=...&resumeOrgId=...` URL. Use delivery id as the stable Push tag and reserve `NotificationDeliverySource` value `course_resume_delivery` so the existing daily budget deduplicates across review, anchor and resume solicitations.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm exec vitest run tests/jobs/course-resume-delivery.test.ts`

Expected: pass for deferred quiet hours, completion cancellation, duplicate job and two-course budget competition.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/queue.ts lib/jobs/workers.ts lib/server/notification-delivery-policy.ts tests/jobs/course-resume-delivery.test.ts
git commit -m "[S3-012] Relancer les formations inachevées et reprendre au bon endroit"
```

### Task 4: Learner UI routing and progress capture

**Files:**

- Modify: `app/classroom/[id]/page.tsx`
- Modify: `app/(private)/app/page.tsx`
- Modify: `lib/i18n/locales/ui-fr-FR.json`
- Modify: `lib/i18n/locales/ui-en-US.json`
- Modify: `lib/i18n/locales/ui-ar-MA.json`
- Test: `e2e/tests/learner-course-resume.spec.ts`

**Interfaces:**

- Consumes Task 2 save and target routes.
- Reads `resumeCourseId` and `resumeOrgId` only from validated query parameters.
- Produces an explicit, accessible “Reprendre cette activité” action after a restored target is verified.

- [ ] **Step 1: Write a failing browser test**

```ts
await page.goto(`/app?resumeCourseId=${courseId}&resumeOrgId=${orgId}`);
await expect(page.getByRole('button', { name: 'Reprendre cette activité' })).toBeVisible();
await page.getByRole('button', { name: 'Reprendre cette activité' }).click();
await expect(page).toHaveURL(new RegExp(`/classroom/${classroomId}`));
await expect(page.getByTestId(`scene-${sceneId}`)).toBeVisible();
```

- [ ] **Step 2: Run the focused browser test**

Run: `pnpm test:e2e -- e2e/tests/learner-course-resume.spec.ts`

Expected: failure because no learner resume route is consumed.

- [ ] **Step 3: Implement explicit capture and restore**

From the authenticated classroom only, debounce server progress writes after scene changes, discussion draft changes, resource pause/resume and media position updates. A completion event writes `completed_at`; an explicit “Ne plus relancer” writes `abandoned_at`. On restore, resolve the target server-side first; retain only the matching scene, activity state and position, then expose a user-clicked transition. If the target disappeared or access changed, show the localised safe state instead of guessing another scene.

- [ ] **Step 4: Add the three locale keys**

```json
"learnerResume.continue": "Reprendre cette activité",
"learnerResume.unavailable": "Cette reprise n’est plus disponible.",
"learnerResume.stop": "Ne plus me relancer pour cette formation"
```

Translate the three keys idiomatically in English and modern standard Arabic.

- [ ] **Step 5: Re-run the focused browser test**

Run: `pnpm test:e2e -- e2e/tests/learner-course-resume.spec.ts`

Expected: pass for normal restore, revoked access, deleted scene and cross-tenant URL.

- [ ] **Step 6: Commit**

```bash
git add app/classroom/[id]/page.tsx app/(private)/app/page.tsx lib/i18n/locales/ui-fr-FR.json lib/i18n/locales/ui-en-US.json lib/i18n/locales/ui-ar-MA.json e2e/tests/learner-course-resume.spec.ts
git commit -m "[S3-012] Relancer les formations inachevées et reprendre au bon endroit"
```

### Task 5: Production reconciliation

**Files:**

- Create: `scripts/proofs/s3-012-production.ts`
- Create: `scripts/proofs/run-s3-012-production.sh`
- Modify: `.ralph/prd-v3.json`
- Modify: `.ralph/progress.md`

**Interfaces:**

- Consumes all prior tasks and the production worker.
- Produces `evidence.json` with the two device-direction fixtures, the delivery id, the resolved scene/activity and cleanup audit.

- [ ] **Step 1: Write the production proof**

```ts
assert.equal(await recordProgress(webLearner, sceneA, 12000), 'saved');
assert.equal(await resolveAfterLogin(mobileLearner), { sceneId: sceneA, activity: 'quiz', positionMs: 12000 });
assert.equal(await completeBeforeDelivery(webLearner), 'cancelled');
assert.equal(await cleanupAudit(marker), 0);
```

- [ ] **Step 2: Apply migration after a schema backup and deploy the exact SHA**

Run the backup, migration, PostgREST reload and Coolify deployment through ServeurIA. Record only SHA, HTTP statuses and cleanup counts; never record credentials.

- [ ] **Step 3: Run the complete quality gate on ServeurIA**

Run: `pnpm check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`

Expected: zero errors and zero warnings.

- [ ] **Step 4: Run the production proof and record the unresolved physical-device condition**

Run: `bash scripts/proofs/run-s3-012-production.sh`

Expected: no duplicate delivery, cross-tenant denial, exact restore after login and zero fixture residue. Keep S3-012 `to_validate` until the same flow is witnessed on real iOS and Android with the app closed; that human/device acceptance is not replaced by Chromium.

- [ ] **Step 5: Commit the evidence and reconcile the PRD**

```bash
git add scripts/proofs/s3-012-production.ts scripts/proofs/run-s3-012-production.sh .ralph/prd-v3.json .ralph/progress.md
git commit -m "[S3-012] Relancer les formations inachevées et reprendre au bon endroit"
```

## Self-Review

- Spec coverage: Tasks 1–2 establish server-backed learner progress, tenant isolation and safe post-login resolution. Task 3 covers timing, preference, privacy, completion and deduplication. Task 4 provides web/mobile restore and explicit user control. Task 5 covers worker restart, two directions, cleanup and the remaining physical-device proof.
- Placeholder scan: no TBD, TODO, generic error handling or unspecified tests remain.
- Type consistency: `courseId`, `orgId`, `sceneId`, `activity`, `activityState` and `positionMs` retain the same names across SQL, route, queue and UI contracts.

## Execution Handoff

This plan is intentionally executed inline in this session: it is one coherent product capability, and Qalem’s shared worktree must not be modified concurrently.
