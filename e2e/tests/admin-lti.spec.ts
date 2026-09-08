import { expect, test } from '../fixtures/base';
import fr from '../../lib/i18n/locales/ui-fr-FR.json';
import ar from '../../lib/i18n/locales/ui-ar-MA.json';
import en from '../../lib/i18n/locales/ui-en-US.json';

for (const [locale, labels] of Object.entries({ 'fr-FR': fr, 'ar-MA': ar, 'en-US': en })) {
  test(`LTI bindings require confirmed tenant, existing identities and explicit revocation (${locale})`, async ({
    page,
    browserConsoleContract,
  }) => {
    browserConsoleContract.expectHttpError('/api/lti/bindings', 409);
    await page.addInitScript((language) => localStorage.setItem('locale', language), locale);
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({ json: { isAdmin: true } }),
    );
    await page.route('**/api/lti/config', (route) => route.fulfill({ json: { title: 'Qalem' } }));
    const platformId = '00000000-0034-4000-8000-000000000001';
    const orgId = '00000000-0034-4000-8000-000000000002';
    let assigned: string | null = null;
    await page.route('**/api/lti/platforms', async (route) => {
      if (route.request().method() === 'PATCH') {
        expect(route.request().postDataJSON()).toEqual({ platformId, orgId });
        assigned = orgId;
        return route.fulfill({ json: { id: platformId, orgId } });
      }
      return route.fulfill({
        json: [
          {
            id: platformId,
            clientId: 'lms-test',
            issuer: 'https://lms.example',
            deploymentId: 'deployment',
            orgId: assigned,
          },
        ],
      });
    });
    const bindings: Record<string, Array<Record<string, string>>> = { resource: [], user: [] };
    let creates = 0;
    let deletes = 0;
    await page.route('**/api/lti/bindings*', async (route) => {
      if (route.request().method() === 'GET') {
        const params = new URL(route.request().url()).searchParams;
        expect(params.get('platformId')).toBe(platformId);
        return route.fulfill({
          json: { orgId: assigned, bindings: bindings[params.get('kind')!], nextOffset: null },
        });
      }
      const body = route.request().postDataJSON();
      expect(body).not.toHaveProperty('orgId');
      expect(body).not.toHaveProperty('clientId');
      expect(body.platformId).toBe(platformId);
      if (route.request().method() === 'DELETE') {
        deletes++;
        bindings[body.kind] = bindings[body.kind].filter((row) => row.id !== body.bindingId);
        return route.fulfill({ json: { success: true } });
      }
      creates++;
      if (creates === 1) return route.fulfill({ status: 409, json: { success: false } });
      const binding =
        body.kind === 'resource'
          ? { id: platformId, resource_link_id: body.resourceLinkId, stage_id: body.stageId }
          : { id: orgId, lms_subject: body.lmsSubject, user_id: body.userId };
      bindings[body.kind].push(binding);
      return route.fulfill({ status: 201, json: binding });
    });
    await page.goto('/admin?tab=lti');
    await page.getByRole('button', { name: labels['admin.lti.manageBindings'] }).click();
    await expect(page.getByText(labels['admin.lti.assignHint'])).toBeVisible();
    await expect(page.getByLabel(labels['admin.lti.resourceLinkId'], { exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel(labels['admin.lti.orgId'], { exact: true }).fill(orgId);
    await page.getByRole('button', { name: labels['admin.lti.assignTenant'] }).click();
    const courses = page.getByRole('region', { name: labels['admin.lti.resourceBindings'] });
    const members = page.getByRole('region', { name: labels['admin.lti.userBindings'] });
    await expect(courses.getByText(labels['admin.lti.noBindings'])).toBeVisible();
    await courses.getByLabel(labels['admin.lti.resourceLinkId']).fill('assignment-1');
    await courses.getByLabel(labels['admin.lti.stageId']).fill('stage-1');
    await courses.getByRole('button', { name: labels['admin.lti.addBinding'] }).click();
    await expect(courses.getByRole('alert')).toHaveText(labels['admin.lti.bindingWriteFailed']);
    await expect(courses.getByLabel(labels['admin.lti.stageId'])).toHaveValue('stage-1');
    await expect(courses.getByRole('listitem')).toHaveCount(0);
    await courses.getByRole('button', { name: labels['admin.lti.addBinding'] }).click();
    await expect(courses.getByRole('listitem')).toContainText('assignment-1');
    await members.getByLabel(labels['admin.lti.lmsSubject']).fill('opaque-subject');
    await members.getByLabel(labels['admin.lti.userId']).fill(platformId);
    await members.getByRole('button', { name: labels['admin.lti.addBinding'] }).click();
    await expect(members.getByRole('listitem')).toContainText('opaque-subject');
    await page.reload();
    await page.getByRole('button', { name: labels['admin.lti.manageBindings'] }).click();
    await expect(courses.getByRole('listitem')).toContainText('stage-1');
    await expect(members.getByRole('listitem')).toContainText(platformId);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain(labels['admin.lti.revokeConfirm']);
      await dialog.dismiss();
    });
    await courses
      .getByRole('button', {
        name: `${labels['admin.lti.revokeBinding']} assignment-1`,
        exact: true,
      })
      .click();
    expect(deletes).toBe(0);
    page.once('dialog', (dialog) => dialog.accept());
    await courses
      .getByRole('button', {
        name: `${labels['admin.lti.revokeBinding']} assignment-1`,
        exact: true,
      })
      .click();
    await expect(courses.getByText(labels['admin.lti.noBindings'])).toBeVisible();
    await expect(members.getByRole('listitem')).toContainText('opaque-subject');
    expect(deletes).toBe(1);
    expect(creates).toBe(3);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
  });

  test(`LTI platform persists only after server success (${locale})`, async ({
    page,
    browserConsoleContract,
  }) => {
    browserConsoleContract.expectHttpError('/api/lti/platforms', 409);
    await page.addInitScript((language) => localStorage.setItem('locale', language), locale);
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({ json: { isAdmin: true } }),
    );
    await page.route('**/api/lti/config', (route) => route.fulfill({ json: { title: 'Qalem' } }));
    let platform: Record<string, string> | null = null;
    let writes = 0;
    await page.route('**/api/lti/platforms', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: platform ? [platform] : [] });
      writes++;
      if (writes === 1) return route.fulfill({ status: 409, json: { success: false } });
      platform = { ...route.request().postDataJSON(), id: '00000000-0034-4000-8000-000000000001' };
      return route.fulfill({ status: 201, json: platform });
    });
    await page.goto('/admin?tab=lti');
    await page.getByRole('button', { name: labels['admin.lti.addPlatform'], exact: true }).click();
    const values = {
      'admin.lti.orgId': '00000000-0034-4000-8000-000000000002',
      'admin.lti.clientId': 'test-lms-client',
      'admin.lti.issuer': 'https://lms.example',
      'admin.lti.jwksUrlField': 'https://lms.example/jwks',
      'admin.lti.authUrl': 'https://lms.example/auth',
      'admin.lti.tokenUrl': 'https://lms.example/token',
      'admin.lti.deploymentId': 'deployment-test',
    };
    for (const [key, value] of Object.entries(values)) {
      await page.getByLabel(labels[key as keyof typeof labels], { exact: true }).fill(value);
    }
    await page.getByRole('button', { name: labels['admin.lti.save'], exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: labels['admin.lti.saveFailed'] }),
    ).toBeVisible();
    await expect(page.getByText('(test-lms-client)', { exact: true })).toBeHidden();
    await expect(page.getByLabel(labels['admin.lti.clientId'], { exact: true })).toHaveValue(
      'test-lms-client',
    );
    await page.getByRole('button', { name: labels['admin.lti.save'], exact: true }).click();
    await expect(page.getByText('(test-lms-client)', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('(test-lms-client)', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
    expect(writes).toBe(2);
  });
}
