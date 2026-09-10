import { readFile } from 'node:fs/promises';
import { test, expect } from '../fixtures/base';

for (const [locale, label] of [
  ['fr-FR', 'Télécharger l’export JSON'],
  ['ar-MA', 'تنزيل التصدير بصيغة JSON'],
  ['en-US', 'Download JSON export'],
] as const) {
  test(`personal JSON downloads without leaving the profile — ${locale}`, async ({
    page,
    mockApi,
    context,
  }) => {
    await mockApi.mockRichProfileDisabled();
    await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
    const payload = {
      formatVersion: 2,
      accountIdentity: { email: 'export@example.test', providers: ['email'] },
      includedSections: ['profiles', 'session_events', 'evaluations', 'lti_quiz_attempts'],
      profiles: [{ nickname: 'Épreuve قلم' }],
      session_events: [{ id: '9007199254741300', payload: { text: 'Ma question' } }],
      evaluations: [{ phase: 'hot', score: 80 }],
      lti_quiz_attempts: [],
      complete: true,
    };
    let requests = 0;
    await context.route('**/api/account/export', async (route) => {
      expect(route.request().method()).toBe('GET');
      expect(new URL(route.request().url()).search).toBe('');
      requests++;
      await route.fulfill({
        contentType: 'application/json',
        headers: {
          'Content-Disposition': 'attachment; filename="qalem-data-export-proof.json"',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify(payload),
      });
    });
    await page.goto('/profile');
    const link = page.getByRole('link', { name: label, exact: true });
    await expect(link).toHaveAttribute('href', '/api/account/export');
    await expect(link).toHaveAccessibleDescription(/.+/);
    expect(requests).toBe(0);
    const downloadEvent = page.waitForEvent('download');
    await link.click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe('qalem-data-export-proof.json');
    const path = await download.path();
    expect(path).not.toBeNull();
    expect(JSON.parse(await readFile(path!, 'utf8'))).toEqual(payload);
    expect(requests).toBe(1);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-MA' ? 'rtl' : 'ltr');
  });
}

test('an unavailable export leaves the profile available and exposes the error response', async ({
  page,
  mockApi,
  context,
}) => {
  await mockApi.mockRichProfileDisabled();
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  await context.route('**/api/account/export', (route) =>
    route.fulfill({ status: 503, json: { error: 'Account export unavailable' } }),
  );
  await page.goto('/profile');
  const pending = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Télécharger l’export JSON', exact: true }).click();
  const popup = await pending;
  await expect(popup.locator('body')).toContainText('Account export unavailable');
  await expect(page).toHaveURL(/\/profile$/);
});
