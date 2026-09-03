import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [magicLinkPath, baseUrl = 'https://qalem.ma'] = process.argv.slice(2);
if (!magicLinkPath) throw new Error('Magic-link file path is required');

const magicLink = (await readFile(magicLinkPath, 'utf8')).trim();
if (!magicLink.startsWith('http')) throw new Error('Magic-link file is invalid');

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));

  await page.goto(magicLink, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await page.goto(`${baseUrl}/admin?tab=widgets`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  const prompt = page.getByLabel('Description du widget');
  await prompt.waitFor({ state: 'visible', timeout: 30_000 });
  await prompt.fill(
    'Crée un calculateur pédagogique de marge avec un prix de vente, un coût et un résultat en pourcentage.',
  );

  const generationResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${baseUrl}/api/admin/widget-templates/generate` &&
      response.request().method() === 'POST',
    { timeout: 120_000 },
  );
  await page.getByRole('button', { name: 'Générer le widget' }).click();
  const generationResponse = await generationResponsePromise;
  assert.equal(generationResponse.status(), 200, 'Real widget generation must return HTTP 200');
  const generationBody = await generationResponse.json();
  assert.equal(generationBody.success, true);
  assert.equal(typeof generationBody.composition?.title, 'string');
  assert.ok(generationBody.composition.title.length > 0);
  await page.getByRole('button', { name: 'Régénérer le widget' }).waitFor({ state: 'visible' });

  const draftResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${baseUrl}/api/admin/widget-templates` &&
      response.request().method() === 'POST',
    { timeout: 60_000 },
  );
  const previewResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/preview') && response.request().method() === 'POST',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Prévisualiser' }).click();
  const [draftResponse, previewResponse] = await Promise.all([
    draftResponsePromise,
    previewResponsePromise,
  ]);
  assert.equal(draftResponse.status(), 201, 'Draft creation must return HTTP 201');
  assert.equal(previewResponse.status(), 200, 'Preview must return HTTP 200');
  const draftBody = await draftResponse.json();
  assert.equal(typeof draftBody.template_id, 'string');
  assert.equal(typeof draftBody.id, 'string');

  const publishResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/publish') && response.request().method() === 'POST',
    { timeout: 60_000 },
  );
  const publishButton = page.getByRole('button', { name: 'Publier' });
  await publishButton.waitFor({ state: 'visible' });
  assert.equal(await publishButton.isEnabled(), true);
  await publishButton.click();
  const publishResponse = await publishResponsePromise;
  assert.equal(publishResponse.status(), 200, 'Publication must return HTTP 200');
  await page.getByText('Widget publié').waitFor({ state: 'visible' });

  process.stdout.write(
    `${JSON.stringify({
      success: true,
      title: generationBody.composition.title,
      templateId: draftBody.template_id,
      versionId: draftBody.id,
      generationStatus: generationResponse.status(),
      previewStatus: previewResponse.status(),
      publishStatus: publishResponse.status(),
    })}\n`,
  );
} finally {
  await browser.close();
}
