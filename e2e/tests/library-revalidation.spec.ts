import { test, expect } from '../fixtures/base';

const orgId = '00000000-0000-4000-8000-000000000002';
const shareId = '00000000-0000-4000-8000-000000000003';
const actor = '00000000-0000-4000-8000-000000000001';
const cases = [
  { locale: 'fr-FR', label: 'Revalider le partage', pending: 'Partage à revalider', result: 'ok' },
  {
    locale: 'ar-MA',
    label: 'إعادة اعتماد المشاركة',
    pending: 'المشاركة بحاجة إلى إعادة اعتماد',
    result: 'ok',
  },
  { locale: 'en-US', label: 'Revalidate share', pending: 'Share needs revalidation', result: 'ok' },
  {
    locale: 'en-US',
    label: 'Revalidate share',
    pending: 'Share needs revalidation',
    result: 'denied',
  },
  {
    locale: 'en-US',
    label: 'Revalidate share',
    pending: 'Share needs revalidation',
    result: 'unverified',
  },
];

for (const scenario of cases) {
  test(`library revalidation ${scenario.locale} ${scenario.result}`, async ({
    page,
    context,
    browserConsoleContract,
  }) => {
    await page.addInitScript((locale) => localStorage.setItem('locale', locale), scenario.locale);
    let verified = false;
    const mutations: { body: unknown; url: string }[] = [];
    const share = () => ({
      id: shareId,
      org_id: orgId,
      stage_id: 'shared-training',
      shared_by: actor,
      visibility: 'public',
      authorization_verified: verified,
      created_at: '2026-09-01T00:00:00Z',
    });
    await context.route(/\/rest\/v1\/org_members(?:\?.*)?$/, (route) =>
      route.fulfill({ json: { role: 'admin' } }),
    );
    await context.route(/\/rest\/v1\/stages(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: [
          {
            id: 'shared-training',
            name: 'Shared training',
            owner_id: actor,
            language: 'fr-FR',
            created_at: '2026-09-01T00:00:00Z',
          },
        ],
      }),
    );
    for (const table of ['scenes', 'profiles']) {
      await context.route(new RegExp(`/rest/v1/${table}(?:\\?.*)?$`), (route) =>
        route.fulfill({ json: [] }),
      );
    }
    await context.route(/\/rest\/v1\/shared_classrooms(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fulfill({ json: [share()] });
      mutations.push({ body: route.request().postDataJSON(), url: route.request().url() });
      if (scenario.result === 'denied')
        return route.fulfill({ status: 403, json: { code: '42501', message: 'Denied' } });
      verified = scenario.result === 'ok';
      return route.fulfill({ json: share() });
    });
    if (scenario.result === 'denied')
      browserConsoleContract.expectHttpError('/rest/v1/shared_classrooms', 403);
    await page.goto(`/org/${orgId}/library`, { waitUntil: 'networkidle' });
    await expect(page.getByText(scenario.pending, { exact: true })).toBeVisible();
    await expect(page.locator('a[href*="/classroom/shared-training"]')).toHaveCount(0);
    await page.getByRole('button', { name: scenario.label, exact: true }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0].body).toEqual({ visibility: 'public' });
    const params = new URL(mutations[0].url).searchParams;
    expect(params.get('id')).toBe(`eq.${shareId}`);
    expect(params.get('org_id')).toBe(`eq.${orgId}`);
    expect(params.get('visibility')).toBe('eq.public');
    if (scenario.result === 'ok') {
      await expect(page.getByText(scenario.pending, { exact: true })).toHaveCount(0);
      await expect(page.locator('a[href*="/classroom/shared-training"]')).toHaveAttribute(
        'href',
        `/classroom/shared-training?orgId=${orgId}`,
      );
    } else {
      await expect(page.getByText('Update not confirmed.', { exact: false })).toBeVisible();
      await expect(page.getByText(scenario.pending, { exact: true })).toBeVisible();
      await expect(page.locator('a[href*="/classroom/shared-training"]')).toHaveCount(0);
    }
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      scenario.locale === 'ar-MA' ? 'rtl' : 'ltr',
    );
  });
}
