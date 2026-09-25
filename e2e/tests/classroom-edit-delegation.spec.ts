import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const STAGE_ID = 'delegated-edit-stage';
const REQUEST_ID = '00000000-6032-4000-8000-000000000100';

function classroomResponse(editAccess?: object, canEdit = false) {
  return {
    success: true,
    canEdit,
    canViewSources: canEdit,
    canInteract: true,
    interactionOrganizationId: '00000000-6032-4000-8000-000000000010',
    ...(editAccess ? { editAccess } : {}),
    classroom: {
      id: STAGE_ID,
      generationComplete: true,
      stage: {
        id: STAGE_ID,
        name: 'Delegated editing course',
        description: '',
        language: 'en-US',
        style: 'professional',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      scenes: [
        {
          id: 'delegated-edit-scene',
          stageId: STAGE_ID,
          type: 'slide',
          title: 'Editable content',
          order: 0,
          content: { type: 'slide', canvas: { id: 'delegated-edit-canvas', elements: [] } },
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('locale', 'en-US');
    localStorage.setItem('settings-storage', settings);
  }, createSettingsStorage());
});

test('a trainer requests access without receiving rights to another course', async ({ page }) => {
  let pending = false;
  await page.route(`**/api/classroom?*`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        classroomResponse({
          role: 'formateur',
          canRequest: true,
          canManage: false,
          requests: pending
            ? [
                {
                  id: REQUEST_ID,
                  stageId: STAGE_ID,
                  requesterId: 'trainer-1',
                  requesterName: 'Trainer A',
                  status: 'pending',
                  requestedAt: new Date().toISOString(),
                  expiresAt: null,
                },
              ]
            : [],
        }),
      ),
    });
  });
  await page.route(`**/api/classroom/${STAGE_ID}/edit-access`, async (route) => {
    if (route.request().method() === 'POST') {
      pending = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, requestId: REQUEST_ID }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        editAccess: {
          role: 'formateur',
          canRequest: true,
          canManage: false,
          requests: pending
            ? [
                {
                  id: REQUEST_ID,
                  stageId: STAGE_ID,
                  requesterId: 'trainer-1',
                  requesterName: 'Trainer A',
                  status: 'pending',
                  requestedAt: new Date().toISOString(),
                  expiresAt: null,
                },
              ]
            : [],
        },
      }),
    });
  });

  await page.goto(`/classroom/${STAGE_ID}`);
  await page.getByRole('button', { name: 'Request access' }).click();
  await expect(page.getByText(/waiting for an administrator or manager/i)).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Edit course' })).toBeDisabled();
});

test('a manager grants a pending request for the selected duration', async ({ page }) => {
  const pendingRequest = {
    id: REQUEST_ID,
    stageId: STAGE_ID,
    requesterId: 'trainer-1',
    requesterName: 'Trainer A',
    status: 'pending',
    requestedAt: new Date().toISOString(),
    expiresAt: null,
  };
  let decision: Record<string, unknown> | null = null;
  await page.route(`**/api/classroom?*`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        classroomResponse(
          { role: 'manager', canRequest: false, canManage: true, requests: [pendingRequest] },
          true,
        ),
      ),
    });
  });
  await page.route(`**/api/classroom/${STAGE_ID}/edit-access`, async (route) => {
    if (route.request().method() === 'PATCH') {
      decision = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, delegation: { id: REQUEST_ID } }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        editAccess: { role: 'manager', canRequest: false, canManage: true, requests: [] },
      }),
    });
  });

  await page.goto(`/classroom/${STAGE_ID}`);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '8 hours' }).click();
  await page.getByRole('button', { name: 'Allow' }).click();

  await expect
    .poll(() => decision)
    .toEqual({
      action: 'approve',
      requestId: REQUEST_ID,
      durationHours: 8,
    });
});

test('a public classroom does not call the protected delegation endpoint', async ({ page }) => {
  let protectedCalls = 0;
  await page.route(`**/api/classroom/${STAGE_ID}/edit-access`, async (route) => {
    protectedCalls += 1;
    await route.fulfill({ status: 401, body: 'Unauthorized' });
  });
  await page.route(`**/api/classroom?*`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(classroomResponse()),
    });
  });

  await page.goto(`/classroom/${STAGE_ID}`);
  await expect(page.getByRole('switch', { name: 'Edit course' })).toBeDisabled();
  await expect.poll(() => protectedCalls).toBe(0);
});
