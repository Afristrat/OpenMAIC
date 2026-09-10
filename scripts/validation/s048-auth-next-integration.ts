// Real GoTrue cookies → Next routes → PostgREST/SQL, isolated synthetic data only.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect, type Browser } from '@playwright/test';

async function main() {
  assert(process.argv.includes('--isolated-s048'));
  assert.equal(process.env.S048_REST_URL, 'http://qalem-prd3-rest-20260910:3000');
  assert.equal(process.env.S048_AUTH_URL, 'http://qalem-prd3-auth-20260910:9999');
  const secret = process.env.S048_JWT_SECRET;
  assert(secret && secret.length >= 32);
  const token = (role: string) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 900 }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  const gateway = createServer((incoming, outgoing) => {
    const auth = incoming.url?.startsWith('/auth/v1/');
    if (!auth && !incoming.url?.startsWith('/rest/v1/')) {
      outgoing.writeHead(404).end();
      return;
    }
    const upstream = request(
      {
        hostname: auth ? 'qalem-prd3-auth-20260910' : 'qalem-prd3-rest-20260910',
        port: auth ? 9999 : 3000,
        path: incoming.url!.slice(auth ? '/auth/v1'.length : '/rest/v1'.length),
        method: incoming.method,
        headers: incoming.headers,
        timeout: 10000,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  gateway.listen(3018, '127.0.0.1');
  await once(gateway, 'listening');
  const url = 'http://127.0.0.1:3018';
  const app = 'http://127.0.0.1:3020';
  const serviceKey = token('service_role');
  const anonKey = token('anon');
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const org = randomUUID();
  const stage = `s048-auth-${randomUUID()}`;
  const scene = `${stage}-quiz`;
  const actors: string[] = [];
  let browser: Browser | undefined;
  const standalone = process.argv.includes('--standalone');
  if (standalone) {
    cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
    cpSync('public', '.next/standalone/public', { recursive: true });
  }
  const server = spawn(
    standalone ? process.execPath : 'pnpm',
    standalone
      ? ['.next/standalone/server.js']
      : ['exec', 'next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3020'],
    {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        NODE_ENV: standalone ? 'production' : 'development',
        HOSTNAME: '127.0.0.1',
        PORT: '3020',
        NEXT_PUBLIC_E2E_TEST_MODE: 'false',
        NEXT_PUBLIC_SUPABASE_URL: url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        NEXT_PUBLIC_APP_URL: app,
        SUPER_ADMIN_EMAILS: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );
  // No payloads, sessions, headers or SDK errors enter the transcript.
  const checked = (error: { code?: string } | null, operation: string) =>
    assert(!error, `${operation} failed (${error?.code ?? 'unknown'})`);
  try {
    for (let attempt = 0; ; attempt++) {
      assert(server.exitCode === null && attempt < 90, 'Next startup failed');
      const ready = await fetch(
        `${app}/api/organizations/${org}/director-experiment?stageId=${stage}`,
        { signal: AbortSignal.timeout(5000) },
      ).catch(() => null);
      if (ready?.status === 401) break;
      await delay(1000);
    }
    browser = await chromium.launch({ headless: true });
    const sessions: { name: string; value: string }[][] = [];
    for (let index = 0; index < 2; index++) {
      const email = `s048-${randomUUID()}@example.invalid`;
      const password = `Recipe-${randomUUID()}!`;
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
      checked(created.error, 'create synthetic account');
      assert(created.data.user);
      actors.push(created.data.user.id);
      const jar = new Map<string, string>();
      const client = createServerClient(url, anonKey, {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (cookies) => {
            for (const cookie of cookies) jar.set(cookie.name, cookie.value);
          },
        },
      });
      const signed = await client.auth.signInWithPassword({ email, password });
      checked(signed.error, 'real password sign-in');
      assert.equal(signed.data.user?.id, actors[index]);
      assert(jar.size > 0, 'SSR cookies absent');
      sessions.push([...jar].map(([name, value]) => ({ name, value })));
    }
    checked(
      (await db.from('organizations').insert({ id: org, name: 'S048 Auth recipe', seat_limit: 10 }))
        .error,
      'organization',
    );
    checked(
      (
        await db.from('org_members').insert(
          actors.map((id, index) => ({
            user_id: id,
            org_id: org,
            role: index === 0 ? 'admin' : 'apprenant',
          })),
        )
      ).error,
      'memberships',
    );
    checked(
      (
        await db.from('stages').insert({
          id: stage,
          owner_id: actors[0],
          org_id: org,
          name: 'Auth recipe',
          language: 'fr-FR',
          agent_ids: ['a'],
        })
      ).error,
      'classroom',
    );
    checked(
      (
        await db.from('scenes').insert({
          id: scene,
          stage_id: stage,
          type: 'quiz',
          order: 0,
          content: {
            type: 'quiz',
            questions: [
              {
                id: 'q',
                type: 'single',
                question: 'Choose',
                options: [{ label: 'A', value: 'a' }],
                answer: ['a'],
                points: 1,
              },
            ],
          },
        })
      ).error,
      'quiz',
    );
    const reportPath = `/api/organizations/${org}/director-experiment?stageId=${stage}`;
    const context = await browser.newContext();
    const page = await context.newPage();
    assert.equal(
      (await page.goto(`${app}${reportPath}`))?.status(),
      401,
      'Anonymous report not denied',
    );
    await context.addCookies(sessions[0].map((cookie) => ({ ...cookie, url: app })));
    assert.equal((await page.goto(`${app}${reportPath}`))?.status(), 200, 'Admin report denied');
    const report = JSON.parse(await page.locator('body').innerText());
    assert.equal(report.experiment, 'qalem-director-v1');
    assert.deepEqual(report.cohorts, []);
    const post = (path: string, body: unknown) =>
      page.evaluate(
        async ({ path, body }) => {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { status: response.status, body: await response.json() };
        },
        { path, body },
      );
    const readReport = () => page.evaluate(async (path) => (await fetch(path)).json(), reportPath);
    const initialConsent = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/telemetry-consent') && response.request().method() === 'GET',
    );
    const appResponse = await page.goto(`${app}/app`);
    assert.equal(appResponse?.status(), 200, 'Private application route unavailable');
    assert.equal(new URL(page.url()).pathname, '/app', 'Private application route redirected');
    assert.equal((await initialConsent).status(), 200, 'Initial consent state unavailable');
    const banner = page.getByRole('region', { name: 'Analyses d’apprentissage', exact: true });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'En savoir plus', exact: true }).click();
    await expect(
      banner.getByText('Les identifiants sont pseudonymisés', { exact: false }),
    ).toBeVisible();
    const allow = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/telemetry-consent') && response.request().method() === 'POST',
    );
    await banner.getByRole('button', { name: 'Autoriser les analyses', exact: true }).click();
    assert.equal((await allow).status(), 200, 'Consent banner did not persist');
    await expect(banner).toHaveCount(0);
    const consent = await page.evaluate(async () => (await fetch('/api/telemetry-consent')).json());
    assert.equal(consent.choice, true);
    assert.equal(typeof consent.epoch, 'string');
    checked(
      (
        await db.from('courses').insert({
          owner_id: actors[0],
          org_id: org,
          stage_id: stage,
          title: 'Auth context',
          language: 'fr-FR',
          source_kind: 'generated',
          status: 'ready',
          outline: { analyticsContext: { subjectTags: ['SIPOC'] } },
        })
      ).error,
      'course context',
    );
    // A synthetic completed generation is a fixture, not proof that a model spoke.
    // Collection, native grading, linkage and report below use real authenticated routes.
    const receipt = randomUUID();
    const begun = await db.rpc('begin_director_receipt', {
      p_actor: actors[0],
      p_org: org,
      p_stage: stage,
      p_scene: scene,
      p_id: receipt,
      p_classic: 'a',
    });
    checked(begun.error, 'receipt fixture');
    assert.equal(begun.data, receipt);
    const pending = await readReport();
    assert.equal(pending.cohorts.length, 1);
    checked(
      (
        await db.rpc('select_director_receipt', {
          p_actor: actors[0],
          p_id: receipt,
          p_selected: 'a',
          p_reason: pending.cohorts[0].cohort === 'classic' ? 'control' : 'no-compatible-pattern',
          p_sample: null,
          p_score: null,
          p_lookup_ms: 0,
        })
      ).error,
      'selection fixture',
    );
    checked(
      (
        await db.rpc('finish_director_receipt', {
          p_actor: actors[0],
          p_id: receipt,
          p_outcome: 'completed',
        })
      ).error,
      'generation fixture',
    );
    const observation = {
      sessionId: randomUUID(),
      consentEpoch: consent.epoch,
      orgId: org,
      stageId: stage,
      sceneSequence: ['quiz'],
      sceneDurations: [1],
      quizScores: [],
      completionRate: 0,
      totalDuration: 1,
      subjectTags: [],
      language: 'fr-FR',
      level: null,
      agentCount: 1,
      actionCounts: { play: 1, pause: 0, seek: 0 },
      sceneObservations: [{ id: scene, type: 'quiz', seconds: 1, completed: false, score: null }],
      discussions: [
        {
          discussionId: randomUUID(),
          sceneId: scene,
          durationBasis: 'client-monotonic-elapsed',
          classificationMethod: 'text-heuristic-v1',
          turns: [
            {
              id: `assistant-${receipt}`,
              agentId: 'a',
              interventionType: 'question',
              durationMs: 300,
              outcome: 'completed',
            },
          ],
          postDiscussionQuiz: null,
        },
      ],
    };
    assert.deepEqual(await post('/api/learning-observations', observation), {
      status: 200,
      body: { recorded: true },
    });
    assert.deepEqual(await post('/api/learning-observations', observation), {
      status: 200,
      body: { recorded: true },
    });
    const submission = {
      requestId: randomUUID(),
      orgId: org,
      stageId: stage,
      sceneId: scene,
      answers: {},
    };
    const submit = (body: typeof submission) =>
      page.evaluate(async (data) => {
        const response = await fetch('/api/quiz-attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return { status: response.status, body: await response.json() };
      }, body);
    const first = await submit(submission);
    assert.equal(first.status, 200, 'Authenticated native quiz failed');
    assert.equal(first.body.score, 0);
    assert.equal(first.body.status, 'completed');
    assert.deepEqual(await submit(submission), first, 'HTTP replay changed receipt');
    const saved = await db
      .from('classroom_quiz_attempts')
      .select('user_id')
      .eq('id', first.body.attemptId)
      .single();
    checked(saved.error, 'persisted receipt');
    assert.equal(saved.data?.user_id, actors[0], 'Server used a different identity');
    const linked = await readReport();
    assert.equal(linked.cohorts.length, 1);
    assert.equal(linked.cohorts[0].assignedUnits, 1);
    assert.equal(linked.cohorts[0].unitsWithQuiz, 1);
    assert.equal(linked.cohorts[0].linkedTurns, 1);
    assert.equal(linked.cohorts[0].meanQuizScore, 0);
    for (const [locale, open, title, assigned, score] of [
      [
        'fr-FR',
        'Voir le Director',
        'Comparaison du Director',
        'Participants assignés',
        'Score moyen des quiz',
      ],
      ['en-US', 'View Director', 'Director comparison', 'Assigned participants', 'Mean quiz score'],
      ['ar-MA', 'عرض الموجّه', 'مقارنة الموجّه', 'المشاركون المعيّنون', 'متوسط درجات الاختبارات'],
    ]) {
      await page.evaluate((locale) => localStorage.setItem('locale', locale), locale);
      const response = page.waitForResponse((r) =>
        r.url().includes(`/api/organizations/${org}/reports?`),
      );
      await page.goto(`${app}/org/${org}/reports`);
      assert.equal((await response).status(), 200, 'Real institutional report failed');
      await page.getByRole('button', { name: open, exact: true }).click();
      const visibleReport = page.getByRole('region', { name: title, exact: true });
      await expect(
        visibleReport.getByRole('row').filter({ hasText: assigned }).getByRole('cell').first(),
      ).toHaveText(new Intl.NumberFormat(locale).format(1));
      await expect(
        visibleReport.getByRole('row').filter({ hasText: score }).getByRole('cell').first(),
      ).toHaveText(new Intl.NumberFormat(locale, { style: 'percent' }).format(0));
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
      await expect(visibleReport.getByText('Auth recipe', { exact: true })).toBeVisible();
      await visibleReport.getByRole('button').click();
      await expect(visibleReport.getByRole('table')).toBeVisible();
    }
    await page.goto(`${app}/profile`);
    const profileConsent = page.getByRole('region', {
      name: 'Analyses d’apprentissage',
      exact: true,
    });
    await expect(profileConsent).toBeVisible();
    await expect(profileConsent.getByText('Analyses autorisées', { exact: true })).toBeVisible();
    const withdraw = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/telemetry-consent') && response.request().method() === 'POST',
    );
    await profileConsent.getByRole('button', { name: 'Retirer mon accord', exact: true }).click();
    assert.equal((await withdraw).status(), 200, 'Profile withdrawal did not persist');
    await expect(profileConsent.getByText('Analyses refusées', { exact: true })).toBeVisible();
    assert.deepEqual((await readReport()).cohorts, [], 'Withdrawal retained experiment data');
    assert.deepEqual(await post('/api/learning-observations', observation), {
      status: 200,
      body: { recorded: false },
    });
    assert.equal((await post('/api/telemetry-consent', { consent: true })).status, 200);
    assert.deepEqual(
      await post('/api/learning-observations', observation),
      { status: 200, body: { recorded: false } },
      'Old consent epoch accepted',
    );
    assert.deepEqual((await readReport()).cohorts, [], 'Reconsent resurrected experiment');
    assert.deepEqual(await submit(submission), first, 'Withdrawal deleted functional quiz receipt');
    const foreign = randomUUID();
    assert.equal(
      (await submit({ ...submission, requestId: randomUUID(), orgId: foreign })).status,
      403,
      'Foreign tenant quiz admitted',
    );
    assert.equal(
      (
        await page.goto(`${app}/api/organizations/${foreign}/director-experiment?stageId=${stage}`)
      )?.status(),
      403,
      'Foreign tenant report admitted',
    );
    await context.clearCookies();
    await context.addCookies(sessions[1].map((cookie) => ({ ...cookie, url: app })));
    assert.equal(
      (await page.goto(`${app}${reportPath}`))?.status(),
      403,
      'Learner obtained admin report',
    );
    await context.clearCookies();
    assert.equal(
      (await submit({ ...submission, requestId: randomUUID() })).status,
      401,
      'Anonymous quiz admitted',
    );
    await context.close();
    console.log(
      'PASS: real Auth/SSR/browser/Next/SQL; collection, quiz, nonempty report, withdrawal, old epoch, rights, zero score and replay',
    );
    console.log(`Next runtime: ${standalone ? 'production standalone' : 'development webpack'}`);
  } finally {
    await browser?.close();
    if (server.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        /* Process already exited. */
      }
      await Promise.race([once(server, 'exit'), delay(5000)]);
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        /* Process group already exited. */
      }
    }
    try {
      checked((await db.from('courses').delete().eq('stage_id', stage)).error, 'cleanup course');
      checked((await db.from('stages').delete().eq('id', stage)).error, 'cleanup classroom');
      checked(
        (await db.from('organizations').delete().eq('id', org)).error,
        'cleanup organization',
      );
      for (const actor of actors)
        checked((await db.auth.admin.deleteUser(actor)).error, 'cleanup account');
      console.log('PASS: isolated recipe data removed');
    } finally {
      gateway.closeAllConnections();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  }
}
main().catch((error: unknown) => {
  // Assertions may embed response objects; do not dump them or auth sessions.
  console.error('FAIL:', error instanceof Error ? error.message.split('\n')[0] : 'Recipe failed');
  process.exitCode = 1;
});
