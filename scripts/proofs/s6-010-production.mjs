import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.QALEM_PROOF_BASE_URL ?? 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const artifactDir = process.env.PROOF_ARTIFACT_DIR;
assert.equal(new URL(base).hostname, 'qalem.ma', 'Proof target must remain Qalem production');
assert(supabaseUrl && anon && service && artifactDir, 'Missing private proof configuration');

const marker = `s6010-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
let userId;
let cardId;
let browser;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Evidence deliberately records statuses and counters, never service responses.
  }
  return { status: response.status, body };
}

function serviceHeaders(body = false) {
  return {
    apikey: service,
    authorization: `Bearer ${service}`,
    ...(body ? { 'content-type': 'application/json' } : {}),
  };
}

async function createSession() {
  const email = `${marker}@qalem.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const created = await request(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(true),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200, 'Temporary account creation failed');
  assert.equal(typeof created.body?.id, 'string', 'Temporary account lacks its identifier');
  userId = created.body.id;

  const signed = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signed.status, 200, 'Temporary account sign-in failed');
  assert.equal(typeof signed.body?.access_token, 'string', 'Sign-in lacks an access token');
  const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(signed.body)).toString('base64url')}`;
  return {
    cookie: { name: key, value, domain: new URL(base).hostname, path: '/', secure: true, sameSite: 'Lax' },
  };
}

async function createDueCard() {
  const inserted = await request(`${supabaseUrl}/rest/v1/review_cards`, {
    method: 'POST',
    headers: { ...serviceHeaders(true), prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: userId,
      question: `Rappel temporaire ${marker}`,
      correct_answer: 'Réponse de référence',
      user_answer: 'Réponse à reprendre',
      due_date: new Date(Date.now() - 60_000).toISOString(),
      source_ids: [],
      tags: ['s6-010-proof'],
    }),
  });
  assert.equal(inserted.status, 201, 'Due card creation failed');
  assert.equal(typeof inserted.body?.[0]?.id, 'string', 'Due card lacks its identifier');
  cardId = inserted.body[0].id;
}

async function cleanup() {
  if (cardId) {
    const removed = await request(`${supabaseUrl}/rest/v1/review_cards?id=eq.${encodeURIComponent(cardId)}`, {
      method: 'DELETE', headers: serviceHeaders(),
    });
    assert([200, 204].includes(removed.status), 'Due card cleanup failed');
    cardId = undefined;
  }
  if (userId) {
    const removed = await request(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE', headers: serviceHeaders(),
    });
    assert([200, 204, 404].includes(removed.status), 'Temporary account cleanup failed');
    userId = undefined;
  }
}

try {
  const session = await createSession();
  await createDueCard();
  await mkdir(artifactDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'allow', permissions: ['notifications'] });
  await context.addCookies([session.cookie]);
  await context.addInitScript(({ accountId }) => {
    localStorage.setItem(`qalem-notification-prefs:${accountId}`, JSON.stringify({ push: true }));
  }, { accountId: userId });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(`page:${error.message.slice(0, 160)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console:${message.text().slice(0, 160)}`);
  });
  await page.goto(`${base}/review`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.ready;
      const notifications = await registration.getNotifications({ tag: 'review-reminder' });
      if (notifications.length !== 1) return false;
      return true;
    },
    { timeout: 30_000 },
  );
  const firstLastCheck = await page.evaluate(
    ({ accountId }) => localStorage.getItem(`qalem-review-reminder-last-check:${accountId}`),
    { accountId: userId },
  );
  assert.equal(typeof firstLastCheck, 'string', 'Reminder did not persist its deduplication mark');
  await page.reload({ waitUntil: 'networkidle' });
  const secondLastCheck = await page.evaluate(
    ({ accountId }) => localStorage.getItem(`qalem-review-reminder-last-check:${accountId}`),
    { accountId: userId },
  );
  assert.equal(secondLastCheck, firstLastCheck, 'Reload bypassed reminder deduplication');
  assert.deepEqual(failures, [], `Browser errors: ${failures.join(' | ')}`);
  await page.screenshot({ path: `${artifactDir}/review-reminder.png`, fullPage: true });
  await writeFile(`${artifactDir}/evidence.json`, JSON.stringify({ marker, reminderCount: 1, target: '/review' }, null, 2));
  console.log(JSON.stringify({ marker, reminderCount: 1, target: '/review' }));
} finally {
  await browser?.close();
  await cleanup();
}
