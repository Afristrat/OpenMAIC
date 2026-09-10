import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
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
      course_imports: [
        {
          id: '00000000-0036-4000-8000-000000000354',
          downloadUrl: '/api/account/export/imports/00000000-0036-4000-8000-000000000354',
        },
      ],
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
    // Follow the session-protected link from the downloaded manifest through Storage.
    const storage = createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="import-proof.md"',
      });
      response.end('# Formation — قلم');
    });
    await new Promise<void>((resolve) => storage.listen(0, '127.0.0.1', resolve));
    try {
      const address = storage.address();
      if (!address || typeof address === 'string') throw new Error('Missing fixture address');
      await context.route('**/api/account/export/imports/*', (route) =>
        route.fulfill({
          status: 303,
          headers: {
            Location: `http://127.0.0.1:${address.port}/proof-import-file`,
            'Cache-Control': 'no-store',
          },
        }),
      );
      const importedEvent = page.waitForEvent('download');
      await page.goto(payload.course_imports[0].downloadUrl).catch((error: Error) => {
        expect(error.message).toMatch(/Download is starting|net::ERR_ABORTED/);
      });
      const imported = await importedEvent;
      expect(await imported.failure()).toBeNull();
      expect(await readFile((await imported.path())!, 'utf8')).toBe('# Formation — قلم');
    } finally {
      await new Promise<void>((resolve, reject) =>
        storage.close((error) => (error ? reject(error) : resolve())),
      );
    }
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
