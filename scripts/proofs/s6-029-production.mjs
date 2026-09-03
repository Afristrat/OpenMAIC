import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [sessionPath, metadataPath, baseUrl = 'https://qalem.ma'] = process.argv.slice(2);
if (!sessionPath || !metadataPath) {
  throw new Error('Session and metadata output paths are required');
}

const session = JSON.parse(await readFile(sessionPath, 'utf8'));
assert.equal(typeof session.access_token, 'string', 'Session access token is required');
assert.equal(typeof session.refresh_token, 'string', 'Session refresh token is required');

const storageKey = 'sb-db-auth-token';
const encodedSession = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
const cookieValues = [];
for (let offset = 0; offset < encodedSession.length; offset += 3180) {
  cookieValues.push(encodedSession.slice(offset, offset + 3180));
}
const authCookies = cookieValues.map((value, index) => ({
  name: cookieValues.length === 1 ? storageKey : `${storageKey}.${index}`,
  value,
  domain: new URL(baseUrl).hostname,
  path: '/',
  httpOnly: false,
  secure: true,
  sameSite: 'Lax',
}));

const composition = {
  version: 1,
  locale: 'fr-FR',
  direction: 'ltr',
  title: 'Calculateur de marge certifié',
  inputs: [{ id: 'price', label: 'Prix de vente', initial: 100, min: 0, max: 10_000, step: 1 }],
  computations: [
    {
      id: 'margin',
      label: 'Marge',
      expression: {
        op: 'multiply',
        args: [
          { op: 'ref', id: 'price' },
          { op: 'literal', value: 0.2 },
        ],
      },
      unit: 'MAD',
    },
  ],
  nodes: [
    { id: 'price-input', type: 'number_input', inputId: 'price' },
    { id: 'margin-output', type: 'computed_value', computationId: 'margin' },
  ],
  rootNodeIds: ['price-input', 'margin-output'],
  goldenCases: [{ name: 'cas de référence', inputs: { price: 100 }, expected: { margin: 20 } }],
};

function requestBody(outline, orgId) {
  return {
    outline,
    allOutlines: [outline],
    stageId: `proof-stage-${randomUUID()}`,
    orgId,
    stageInfo: { name: 'Preuve S6-029' },
  };
}

function decodeSupabaseSession(cookies) {
  const authParts = cookies
    .filter((cookie) => cookie.name === storageKey || cookie.name.startsWith(`${storageKey}.`))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value);
  assert.ok(authParts.length > 0, 'Tenant authentication cookie is missing');
  const encoded = authParts.join('');
  assert.ok(encoded.startsWith('base64-'), 'Unexpected tenant authentication cookie format');
  return JSON.parse(Buffer.from(encoded.slice('base64-'.length), 'base64url').toString('utf8'));
}

const browser = await chromium.launch({ headless: true });
const metadata = {};
try {
  const adminContext = await browser.newContext({ serviceWorkers: 'block' });
  await adminContext.addCookies(authCookies);
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const tenantEmail = `qalem-s6-029-${stamp}@example.com`;
  const tenantPassword = `Qalem-${randomUUID()}-Aa1!`;

  const tenantAResponse = await adminContext.request.post(`${baseUrl}/api/admin/tenants`, {
    data: {
      name: `Preuve S6-029 A ${stamp}`,
      sector: 'education',
      defaultLocale: 'fr-FR',
      seatLimit: 2,
      administratorEmail: tenantEmail,
    },
  });
  assert.equal(tenantAResponse.status(), 201, 'Tenant A provisioning must return HTTP 201');
  const tenantABody = await tenantAResponse.json();
  assert.equal(typeof tenantABody.tenant?.id, 'string');
  assert.equal(typeof tenantABody.administratorInvitationUrl, 'string');
  metadata.tenantAId = tenantABody.tenant.id;

  const tenantBResponse = await adminContext.request.post(`${baseUrl}/api/admin/tenants`, {
    data: {
      name: `Preuve S6-029 B ${stamp}`,
      sector: 'education',
      defaultLocale: 'fr-FR',
      seatLimit: 1,
      administratorEmail: `unused-${stamp}@example.com`,
    },
  });
  assert.equal(tenantBResponse.status(), 201, 'Tenant B provisioning must return HTTP 201');
  const tenantBBody = await tenantBResponse.json();
  assert.equal(typeof tenantBBody.tenant?.id, 'string');
  metadata.tenantBId = tenantBBody.tenant.id;

  const draftResponse = await adminContext.request.post(`${baseUrl}/api/admin/widget-templates`, {
    data: {
      slug: `proof-s6-029-${stamp}`.toLowerCase(),
      title: composition.title,
      composition,
    },
  });
  assert.equal(draftResponse.status(), 201, 'Widget draft creation must return HTTP 201');
  const draftBody = await draftResponse.json();
  metadata.templateId = draftBody.template_id;
  metadata.versionId = draftBody.id;
  assert.equal(typeof metadata.templateId, 'string');
  assert.equal(typeof metadata.versionId, 'string');

  const publishResponse = await adminContext.request.post(
    `${baseUrl}/api/admin/widget-templates/${metadata.templateId}/publish`,
    { data: { versionId: metadata.versionId } },
  );
  assert.equal(publishResponse.status(), 200, 'Widget publication must return HTTP 200');

  const tenantContext = await browser.newContext({ serviceWorkers: 'block' });
  const tenantPage = await tenantContext.newPage();
  await tenantPage.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
  const invitationToken = new URL(tenantABody.administratorInvitationUrl).searchParams.get(
    'invite',
  );
  assert.ok(invitationToken, 'Tenant A invitation token is missing');
  const signupResponse = await tenantContext.request.post(`${baseUrl}/api/invitations/signup`, {
    data: { token: invitationToken, email: tenantEmail, password: tenantPassword },
  });
  assert.equal(signupResponse.status(), 201, 'Tenant A signup must return HTTP 201');
  await tenantPage.goto(`${baseUrl}/auth`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await tenantPage.locator('#login-email').fill(tenantEmail);
  await tenantPage.locator('#login-password').fill(tenantPassword);
  await Promise.all([
    tenantPage.waitForURL((url) => url.pathname === '/app', { timeout: 60_000 }),
    tenantPage.getByRole('button', { name: 'Connectez-vous' }).click(),
  ]);
  const tenantSession = decodeSupabaseSession(await tenantContext.cookies(baseUrl));
  metadata.tenantUserId = tenantSession.user?.id;
  assert.equal(typeof metadata.tenantUserId, 'string');

  const organizationsResponse = await tenantContext.request.get(`${baseUrl}/api/organizations`);
  assert.equal(organizationsResponse.status(), 200);
  const organizationsBody = await organizationsResponse.json();
  assert.ok(
    organizationsBody.organizations?.some((organization) => organization.id === metadata.tenantAId),
    'Tenant administrator must belong to tenant A',
  );

  const catalogResponse = await tenantContext.request.get(`${baseUrl}/api/widget-templates`);
  assert.equal(catalogResponse.status(), 200, 'Published widget catalog must return HTTP 200');
  const catalogBody = await catalogResponse.json();
  assert.ok(
    catalogBody.templates?.some(
      (template) =>
        template.templateId === metadata.templateId && template.versionId === metadata.versionId,
    ),
    'Catalog must expose the exact published version',
  );

  const outline = {
    id: 'proof-widget-outline',
    type: 'plugin',
    title: composition.title,
    description: 'Calculer puis interpréter la marge.',
    keyPoints: ['Calcul', 'Interprétation'],
    teachingObjective: 'Calculer une marge.',
    estimatedDuration: 180,
    order: 0,
    pluginType: 'published-widget',
    widgetTemplateId: metadata.templateId,
    widgetTemplateVersionId: metadata.versionId,
  };

  const forbiddenResponse = await tenantContext.request.post(
    `${baseUrl}/api/generate/scene-content`,
    { data: requestBody(outline, metadata.tenantBId) },
  );
  assert.equal(forbiddenResponse.status(), 403, 'Cross-tenant consumption must return HTTP 403');

  await tenantPage.evaluate(
    ({ outline, templateId, versionId }) => {
      sessionStorage.setItem(
        'generationSession',
        JSON.stringify({
          sessionId: 'production-proof-s6-029',
          requirements: { requirement: 'Preuve S6-029', language: 'fr-FR' },
          pdfText: '',
          pdfImages: [],
          imageStorageIds: [],
          sceneOutlines: [
            {
              ...outline,
              pluginType: 'published-widget',
              widgetTemplateId: templateId,
              widgetTemplateVersionId: versionId,
            },
          ],
          currentStep: 'generating',
          previewPhase: 'review',
        }),
      );
    },
    { outline, templateId: metadata.templateId, versionId: metadata.versionId },
  );
  await tenantPage.goto(`${baseUrl}/generation-preview`, { waitUntil: 'domcontentloaded' });
  const selector = tenantPage.getByLabel('Plugins');
  await selector.waitFor({ state: 'visible', timeout: 30_000 });
  const pinnedValue = `widget:${metadata.templateId}:${metadata.versionId}`;
  await assert.doesNotReject(() => selector.selectOption(pinnedValue));
  assert.equal(await selector.inputValue(), pinnedValue);
  await tenantPage.reload({ waitUntil: 'domcontentloaded' });
  await tenantPage.getByLabel('Plugins').waitFor({ state: 'visible', timeout: 30_000 });
  assert.equal(await tenantPage.getByLabel('Plugins').inputValue(), pinnedValue);

  const generationResponse = await tenantContext.request.post(
    `${baseUrl}/api/generate/scene-content`,
    { data: requestBody(outline, metadata.tenantAId) },
  );
  assert.equal(
    generationResponse.status(),
    200,
    'Authorized widget consumption must return HTTP 200',
  );
  const generationBody = await generationResponse.json();
  assert.equal(generationBody.content?.pluginType, 'published-widget');
  assert.equal(generationBody.content?.data?.templateId, metadata.templateId);
  assert.equal(generationBody.content?.data?.versionId, metadata.versionId);

  await tenantPage.goto(`${baseUrl}/app`, { waitUntil: 'networkidle' });
  await tenantPage.evaluate(
    ({ content }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('MAIC-Database');
        request.onsuccess = (event) => {
          const db = event.target.result;
          const tx = db.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
          const now = Date.now();
          tx.objectStore('stages').put({
            id: 'production-proof-s6-029',
            name: 'Preuve S6-029',
            description: '',
            language: 'fr-FR',
            style: 'professional',
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('scenes').put({
            id: 'production-proof-widget-scene',
            stageId: 'production-proof-s6-029',
            type: 'plugin',
            title: 'Calculateur de marge certifié',
            order: 0,
            content: { type: 'plugin', ...content },
            actions: [],
            createdAt: now,
            updatedAt: now,
          });
          tx.objectStore('stageOutlines').put({
            stageId: 'production-proof-s6-029',
            outlines: [],
            generationComplete: true,
            createdAt: now,
            updatedAt: now,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    { content: generationBody.content },
  );
  await tenantPage.goto(`${baseUrl}/classroom/production-proof-s6-029`);
  const widget = tenantPage.locator('section[aria-label="Calculateur de marge certifié"]');
  await widget.waitFor({ state: 'visible', timeout: 30_000 });
  const input = widget.getByLabel('Prix de vente');
  assert.equal(await input.inputValue(), '100');
  await input.fill('200');
  await widget.getByText('40 MAD').waitFor({ state: 'visible' });
  assert.equal(await tenantPage.locator('iframe[title*="Plugin Scene"]').count(), 0);

  Object.assign(metadata, {
    success: true,
    catalogStatus: catalogResponse.status(),
    crossTenantStatus: forbiddenResponse.status(),
    generationStatus: generationResponse.status(),
    selectedAfterReload: true,
    renderedValue: '40 MAD',
  });
  await adminContext.close();
  await tenantContext.close();
} finally {
  await writeFile(metadataPath, JSON.stringify(metadata), { encoding: 'utf8', mode: 0o600 });
  await browser.close();
}

process.stdout.write(`${JSON.stringify(metadata)}\n`);
