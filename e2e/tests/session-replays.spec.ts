import { expect, test } from '../fixtures/base';

const SESSION_ID = '24000000-0000-4000-8000-000000000006';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
});

test('ne présente pas un replay partiel si une page suivante échoue', async ({
  page,
  browserConsoleContract,
}) => {
  browserConsoleContract.expectHttpError(`/api/live-sessions/${SESSION_ID}/events`, 503);
  await page.route(`**/api/live-sessions/${SESSION_ID}`, (route) =>
    route.fulfill({
      json: {
        success: true,
        session: {
          id: SESSION_ID,
          last_position_ms: 0,
          courses: { title: 'Replay incomplet', stage_id: '' },
          session_events: [],
        },
        nextCursor: '100',
        upperBound: '101',
      },
    }),
  );
  await page.route(`**/api/live-sessions/${SESSION_ID}/events?*`, (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.goto(`/replays/${SESSION_ID}`);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Impossible de charger les sessions enregistrées.' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Replay incomplet' })).toHaveCount(0);
});

test('liste, reprend et supprime effectivement un replay consenti', async ({ page }) => {
  let deleted = false;
  let classroomReads = 0;
  let pageReads = 0;
  await page.route(`**/api/live-sessions/${SESSION_ID}/events?*`, (route) => {
    pageReads++;
    expect(new URL(route.request().url()).searchParams.get('after')).toBe('3');
    return route.fulfill({
      json: {
        success: true,
        upperBound: '4',
        nextCursor: null,
        events: [
          {
            id: '4',
            ts_ms: 4200,
            actor: 'user',
            event_type: 'user_message',
            payload: { text: 'Dernière page du replay.' },
            audio_path: null,
            audio_bytes: 0,
          },
        ],
      },
    });
  });
  // This library fixture exercises replay events, not a visual course. Its
  // explicit empty scene list must still be loaded without reaching real storage.
  await page.route('**/api/classroom?id=classroom-1', (route) => {
    classroomReads++;
    return route.fulfill({ json: { success: true, classroom: { scenes: [] } } });
  });
  await page.route('**/api/live-sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        sessions: deleted
          ? []
          : [
              {
                id: SESSION_ID,
                recorded: true,
                started_at: '2026-09-03T20:00:00.000Z',
                ended_at: '2026-09-03T20:30:00.000Z',
                last_position_ms: 4200,
                courses: { title: 'Finance durable', stage_id: 'classroom-1' },
              },
            ],
      }),
    }),
  );
  await page.route(`**/api/live-sessions/${SESSION_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = true;
      return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    }
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        session: {
          id: SESSION_ID,
          started_at: '2026-09-03T20:00:00.000Z',
          last_position_ms: 4200,
          courses: { title: 'Finance durable', stage_id: 'classroom-1' },
          session_events: [
            {
              id: 1,
              ts_ms: 0,
              actor: 'system',
              event_type: 'scene_change',
              payload: { sceneId: 'scene-1' },
              audio_path: null,
              audio_bytes: 0,
            },
            {
              id: 2,
              ts_ms: 1000,
              actor: 'agent',
              event_type: 'speech',
              payload: { text: 'Bienvenue dans cette session.' },
              audio_path: 'user/session/intro.wav',
              audio_bytes: 1024,
            },
            {
              id: 3,
              ts_ms: 4200,
              actor: 'user',
              event_type: 'user_message',
              payload: { text: 'Je souhaite approfondir.' },
              audio_path: null,
              audio_bytes: 0,
            },
          ],
        },
        nextCursor: '3',
        upperBound: '4',
      }),
    });
  });
  await page.route(`**/api/live-sessions/${SESSION_ID}/audio?*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      headers: { 'Content-Disposition': 'inline' },
      body: Buffer.from('voice'),
    }),
  );

  await page.goto('/replays');
  await expect(page.getByRole('heading', { name: 'Mes sessions' })).toBeVisible();
  await page.getByRole('link', { name: 'Reprendre' }).click();
  await expect(page.getByRole('heading', { name: 'Finance durable' })).toBeVisible();
  await expect(page.getByText('Bienvenue dans cette session.')).toBeVisible();
  await expect(page.getByText('Je souhaite approfondir.')).toBeVisible();
  await expect(page.getByText('Dernière page du replay.')).toBeVisible();
  expect(pageReads).toBe(1);
  await expect(page.getByRole('slider', { name: 'Position du replay' })).toHaveValue('4200');
  await expect.poll(() => classroomReads).toBeGreaterThan(0);

  await page.goto('/replays');
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByText('Aucune session enregistrée.')).toBeVisible();
  expect(deleted).toBe(true);
});

test('exige une case de consentement non précochée avant tout enregistrement', async ({ page }) => {
  const stageId = 'recording-consent-e2e';
  let startBody: Record<string, unknown> | null = null;
  let evaluationBody: Record<string, unknown> | null = null;
  const events: Record<string, unknown>[] = [];
  await page.route('**/api/live-sessions/capability', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"success":true,"enabled":true}' }),
  );
  await page.route('**/api/live-sessions', async (route) => {
    startBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, session: { id: SESSION_ID } }),
    });
  });
  await page.route(`**/api/live-sessions/${SESSION_ID}/events`, async (route) => {
    events.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.route(`**/api/live-sessions/${SESSION_ID}`, (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"success":true}' }),
  );
  await page.route(`**/api/live-sessions/${SESSION_ID}/evaluations`, async (route) => {
    evaluationBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"success":true,"evaluation":{"id":"evaluation-1","phase":"hot","score":90}}',
    });
  });
  await page.route(`**/api/classroom?id=${stageId}`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        canEdit: false,
        canViewSources: false,
        classroom: {
          generationComplete: true,
          stage: {
            id: stageId,
            name: 'Consentement',
            description: '',
            language: 'fr-FR',
            style: 'interactive',
            agentIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          scenes: [
            {
              id: 'scene-1',
              stageId,
              type: 'slide',
              title: 'Introduction',
              order: 0,
              content: { type: 'slide', canvas: { id: 'slide-1', elements: [] } },
              actions: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      }),
    }),
  );

  await page.goto(`/classroom/${stageId}`);
  await page.getByRole('button', { name: 'Enregistrer cette session' }).click();
  const confirm = page.getByRole('button', { name: 'Commencer l’enregistrement' });
  await expect(confirm).toBeDisabled();
  const consent = page.getByRole('checkbox', {
    name: 'Je consens explicitement à l’enregistrement de cette session, voix comprise.',
  });
  await expect(consent).not.toBeChecked();
  await consent.click();
  await confirm.click();
  await expect(page.getByRole('button', { name: 'Arrêter l’enregistrement' })).toBeVisible();
  expect(startBody).toEqual({ stageId, recorded: true });
  expect(events).toContainEqual(
    expect.objectContaining({ actor: 'system', eventType: 'recording_started' }),
  );

  await page.getByRole('button', { name: 'Arrêter l’enregistrement' }).click();
  await expect(page.getByRole('heading', { name: 'Votre ressenti à chaud' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Passer' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Envoyer' });
  await expect(submit).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Cette session vous a-t-elle été utile ?' })
    .selectOption('5');
  await page
    .getByRole('combobox', {
      name: 'Vous sentez-vous capable d’appliquer ce que vous avez appris ?',
    })
    .selectOption('4');
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Votre ressenti à chaud' })).toBeHidden();
  expect(evaluationBody).toEqual({ useful: 5, confidence: 4 });

  await page.addInitScript(() => localStorage.setItem('locale', 'ar-MA'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'تسجيل هذه الجلسة' }).click();
  await page
    .getByRole('checkbox', { name: 'أوافق صراحةً على تسجيل هذه الجلسة، بما في ذلك صوتي.' })
    .click();
  await page.getByRole('button', { name: 'بدء التسجيل' }).click();
  await page.getByRole('button', { name: 'إيقاف التسجيل' }).click();
  await expect(page.getByRole('heading', { name: 'انطباعك مباشرة بعد الجلسة' })).toBeVisible();
  await page.getByRole('button', { name: 'تخطي' }).click();
  await expect(page.getByRole('heading', { name: 'انطباعك مباشرة بعد الجلسة' })).toBeHidden();
});
