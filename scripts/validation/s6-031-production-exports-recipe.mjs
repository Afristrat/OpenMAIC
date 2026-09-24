import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import JSZip from 'jszip';

const required = ['QALEM_SUPABASE_ANON_KEY', 'QALEM_SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variable requise absente : ${name}`);
}
if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S6-031-HUMAN-YO-IMPACT') {
  throw new Error('Confirmation de recette de production absente');
}

const supabaseUrl = process.env.QALEM_SUPABASE_URL ?? 'https://db.qalem.ma';
const appUrl = process.env.QALEM_APP_URL ?? 'https://qalem.ma';
const orgId = process.env.QALEM_RECIPE_ORG_ID ?? 'aa7870b7-3938-4f24-b8bf-4a9d73565ba7';
const anonKey = process.env.QALEM_SUPABASE_ANON_KEY;
const serviceKey = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

async function jsonRequest(url, init, label) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body?.errorCode ?? body?.code ?? 'UNKNOWN';
    throw new Error(`${label}: HTTP ${response.status} (${code})`);
  }
  return { response, body };
}

async function magicLinkSession(email) {
  const { body: link } = await jsonRequest(
    `${supabaseUrl}/auth/v1/admin/generate_link`,
    {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirectTo: `${appUrl}/app?orgId=${encodeURIComponent(orgId)}` },
      }),
    },
    'Génération de la session de recette',
  );
  if (!link?.hashed_token) throw new Error('Jeton de recette absent');
  const { body: session } = await jsonRequest(
    `${supabaseUrl}/auth/v1/verify`,
    {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
    },
    'Vérification de la session de recette',
  );
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error('Session de recette incomplète');
  }
  return session;
}

function sessionCookieValue(session) {
  return `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
    }),
    'utf8',
  ).toString('base64url')}`;
}

function sessionCookie(session) {
  return `sb-db-auth-token=${sessionCookieValue(session)}`;
}

async function latestCourse() {
  const url = new URL(`${supabaseUrl}/rest/v1/courses`);
  url.searchParams.set('org_id', `eq.${orgId}`);
  url.searchParams.set('stage_id', 'not.is.null');
  url.searchParams.set('select', 'id,title,stage_id,owner_id,status,updated_at');
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', '1');
  const { body } = await jsonRequest(url, { headers: serviceHeaders }, 'Lecture du dernier cours');
  if (!body?.[0]?.stage_id) throw new Error('Aucune formation Human Yo Impact exportable');
  return body[0];
}

async function ownerEmail(ownerId) {
  const usersUrl = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  usersUrl.searchParams.set('page', '1');
  usersUrl.searchParams.set('per_page', '1000');
  const { body } = await jsonRequest(
    usersUrl,
    { headers: serviceHeaders },
    'Lecture du propriétaire de la formation',
  );
  const email = body?.users?.find((user) => user.id === ownerId)?.email;
  if (!email) throw new Error('Adresse du propriétaire de la formation introuvable');
  return email;
}

async function validatePptx(session, course) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
    });
    await context.addCookies([
      {
        name: 'sb-db-auth-token',
        value: sessionCookieValue(session),
        domain: 'qalem.ma',
        path: '/',
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto(`${appUrl}/classroom/${encodeURIComponent(course.stage_id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const menu = page.getByLabel('Exporter PPTX');
    try {
      await menu.waitFor({ state: 'visible', timeout: 45_000 });
    } catch {
      const rendered = (await page.locator('body').innerText()).slice(0, 700).replaceAll('\n', ' ');
      throw new Error(`Export PPTX absent sur ${page.url()} : ${rendered}`);
    }
    await menu.click();
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('export-pptx').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error('Fichier PPTX téléchargé introuvable');
    const archive = await JSZip.loadAsync(await readFile(downloadPath));
    if (!archive.file('[Content_Types].xml')) throw new Error('Archive PPTX invalide');
    const slideFiles = Object.values(archive.files).filter(
      (entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/u.test(entry.name),
    );
    if (slideFiles.length === 0) throw new Error('Aucune diapositive dans le PPTX');
    const slideXml = (await Promise.all(slideFiles.map((entry) => entry.async('string')))).join(
      '\n',
    );
    if (!/[À-ÿŒœ]/u.test(slideXml)) throw new Error('Aucun accent français préservé dans le PPTX');
    if (slideXml.includes('�') || /&#x?(?:0|1[0-9a-f]);/iu.test(slideXml)) {
      throw new Error('Caractère Unicode ou contrôle parasite dans le PPTX');
    }
    const paragraphCount = (slideXml.match(/<a:p[ >]/gu) ?? []).length;
    if (paragraphCount < 2) throw new Error('Structure de paragraphes PPTX insuffisante');
    return {
      suggestedFilename: download.suggestedFilename(),
      slideCount: slideFiles.length,
      paragraphCount,
      unicodeAccentsPreserved: true,
      controlCharactersAbsent: true,
    };
  } finally {
    await browser.close();
  }
}

async function validateMp4(session, course) {
  const cookie = sessionCookie(session);
  const { response: createdResponse, body: created } = await jsonRequest(
    `${appUrl}/api/export-jobs`,
    {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'idempotency-key': `s6031-mp4-${randomUUID()}`,
      },
      body: JSON.stringify({ stageId: course.stage_id, format: 'mp4' }),
    },
    'Création du MP4',
  );
  if (!created?.id) throw new Error('Identifiant du job MP4 absent');
  console.log(JSON.stringify({ mp4JobId: created.id, mp4InitialStatus: created.status }));

  const deadline = Date.now() + 12 * 60_000;
  let status;
  while (Date.now() < deadline) {
    const result = await jsonRequest(
      `${appUrl}/api/export-jobs/${encodeURIComponent(created.id)}`,
      { headers: { cookie } },
      'Lecture du statut MP4',
    );
    status = result.body;
    if (status?.status === 'done' || status?.status === 'error') break;
    await new Promise((resolve) => setTimeout(resolve, status?.pollIntervalMs ?? 5000));
  }
  if (status?.status !== 'done' || !status?.downloadUrl) {
    throw new Error(
      `Export MP4 non terminé : ${status?.status ?? 'timeout'} ${status?.error ?? ''}`,
    );
  }
  const download = await fetch(
    `${appUrl}/api/export-jobs/${encodeURIComponent(created.id)}?download=1`,
    {
      headers: { cookie, range: 'bytes=0-1023' },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!download.ok) throw new Error(`Téléchargement MP4 : HTTP ${download.status}`);
  const bytes = new Uint8Array(await download.arrayBuffer());
  const signature = new TextDecoder('latin1').decode(bytes.slice(4, 12));
  if (!signature.includes('ftyp')) throw new Error('Signature MP4 absente');
  return {
    jobId: created.id,
    createHttpStatus: createdResponse.status,
    finalStatus: status.status,
    sceneCount: status.sceneCount,
    downloadHttpStatus: download.status,
    contentType: download.headers.get('content-type'),
    firstRangeBytes: bytes.byteLength,
    mp4SignaturePresent: true,
  };
}

const course = await latestCourse();
const courseOwnerEmail = await ownerEmail(course.owner_id);
const session = await magicLinkSession(courseOwnerEmail);
const pptx = await validatePptx(session, course);
const mp4 = await validateMp4(session, course);

console.log(
  JSON.stringify({
    courseId: course.id,
    stageId: course.stage_id,
    courseTitle: course.title,
    courseOwnerEmail,
    pptx,
    mp4,
  }),
);
