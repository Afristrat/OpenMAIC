import { expect, test } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';

const locales = [
  {
    locale: 'fr-FR',
    library: 'Bibliothèque de sources',
    title: 'Sources Diwan',
    refresh: 'Actualiser la bibliothèque',
  },
  { locale: 'ar-MA', library: 'مكتبة المصادر', title: 'مصادر ديوان', refresh: 'تحديث المكتبة' },
  {
    locale: 'en-US',
    library: 'Source library',
    title: 'Diwan sources',
    refresh: 'Refresh library',
  },
];
const reference = {
  corpusId: 'corpus:1',
  sourceId: 'source:1',
  sourceVersion: 'version:1',
  checksumSha256: `sha256:${'a'.repeat(64)}`,
  title: 'SIPOC Diwan',
};
for (const locale of locales) {
  test(`Diwan selection persists and reaches generation: ${locale.locale}`, async ({
    page,
    mockApi,
  }) => {
    await page.addInitScript(
      ({ settings, language }) => {
        localStorage.setItem('settings-storage', settings);
        localStorage.setItem('locale', language);
      },
      { settings: createSettingsStorage(), language: locale.locale },
    );
    const generation = await mockApi.mockClassroomGenerationJob();
    let manifest = {
      id: '20000000-0000-4000-8000-000000000099',
      version: 1,
      sourceIds: [],
      diwanReferences: [] as (typeof reference)[],
    };
    await page.route('**/api/source-manifests?*', (route) =>
      route.fulfill({ json: { success: true, manifest } }),
    );
    await page.route('**/api/source-manifests', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.diwanSources).toEqual([{ corpusId: 'corpus:1', sourceId: 'source:1' }]);
      manifest = { ...manifest, version: manifest.version + 1, diwanReferences: [reference] };
      await route.fulfill({ json: { success: true, manifest } });
    });
    await page.route('**/api/documents/diwan/**', (route) =>
      route.fulfill({
        json: {
          items: [{ ...reference, originalName: 'sipoc.pdf', status: 'ready' }],
          pagination: { total: 1 },
        },
      }),
    );
    const home = new HomePage(page);
    await home.goto();
    await page.getByRole('button', { name: locale.library }).click();
    const picker = page.getByRole('region', { name: locale.title });
    await picker.getByRole('button', { name: locale.refresh, exact: true }).click();
    await picker.getByRole('checkbox', { name: 'SIPOC Diwan' }).click();
    await expect(picker.getByRole('checkbox', { name: 'SIPOC Diwan' })).toBeChecked();
    await expect(page.getByRole('button', { name: locale.library })).toContainText('1');
    await page.reload();
    await expect(page.getByRole('button', { name: locale.library })).toContainText('1');
    if (locale.locale === 'ar-MA') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await home.fillRequirement('Expliquer le SIPOC selon les sources sélectionnées.');
    await home.configureAnimation();
    await home.submit();
    await expect
      .poll(() => generation.getPlanRequestBody())
      .toMatchObject({ sourceManifestId: manifest.id });
  });
}
test('Diwan distinguishes missing configuration and resumes an accepted import after reload', async ({
  page,
  browserConsoleContract,
}) => {
  await page.addInitScript((settings) => {
    localStorage.setItem('settings-storage', settings);
    localStorage.setItem('locale', 'en-US');
  }, createSettingsStorage());
  let configured = false;
  let releaseImport: () => void = () => {};
  const importReleased = new Promise<void>((resolve) => {
    releaseImport = resolve;
  });
  await page.route('**/api/documents/diwan/**', async (route) => {
    if (!configured) {
      browserConsoleContract.expectHttpError(new URL(route.request().url()).pathname, 503);
      await route.fulfill({ status: 503, json: { errorCode: 'DIWAN_TENANT_NOT_CONFIGURED' } });
      return;
    }
    const isStatus = route.request().headers()['content-type']?.includes('application/json');
    if (!isStatus) await importReleased;
    await route.fulfill({
      json: {
        jobId: 'job:accepted',
        status: isStatus ? 'ready' : 'queued',
        progress: isStatus ? 100 : undefined,
      },
    });
  });
  const home = new HomePage(page);
  await home.goto();
  await page.getByRole('button', { name: 'Source library' }).click();
  const picker = page.getByRole('region', { name: 'Diwan sources' });
  await picker.getByRole('button', { name: 'Refresh library', exact: true }).click();
  await expect(picker.getByRole('alert')).toContainText('not configured');
  configured = true;
  const acceptedImport = page.waitForResponse(
    (response) => response.url().includes('/api/documents/diwan/') && response.status() === 200,
  );
  await picker.getByTestId('diwan-file-input').setInputFiles({
    name: 'proof.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('SIPOC proof'),
  });
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  releaseImport();
  await acceptedImport;
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem('qalem-diwan-job:00000000-0000-4000-8000-000000000002'),
      ),
    )
    .toBe('job:accepted');
  await page.reload();
  await page.getByRole('button', { name: 'Source library' }).click();
  await expect(picker.getByRole('textbox', { name: 'Import job identifier' })).toHaveValue(
    'job:accepted',
  );
  await picker.getByRole('button', { name: 'Check import status' }).click();
  await expect(picker.getByRole('status')).toContainText('Sources ready');
});
