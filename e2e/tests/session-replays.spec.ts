import { expect, test } from '../fixtures/base';

const SESSION_ID = '24000000-0000-4000-8000-000000000006';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
});

test('liste, reprend et supprime effectivement un replay consenti', async ({ page }) => {
  let deleted = false;
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
  await expect(page.getByRole('slider', { name: 'Position du replay' })).toHaveValue('4200');

  await page.goto('/replays');
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByText('Aucune session enregistrée.')).toBeVisible();
  expect(deleted).toBe(true);
});

test('exige une case de consentement non précochée avant tout enregistrement', async ({ page }) => {
  const stageId = 'recording-consent-e2e';
  let startBody: Record<string, unknown> | null = null;
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
});
