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
    const original = ServiceWorkerRegistration.prototype.showNotification;
    const calls = [];
    Object.defineProperty(window, '__s6010NotificationCalls', { value: calls, configurable: true });
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
      calls.push({ title, tag: options?.tag ?? null, target: options?.data?.url ?? null });
      return original.call(this, title, options);
    };
  }, { accountId: userId });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (error) => failures.push(`page:${error.message.slice(0, 160)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console:${message.text().slice(0, 160)}`);
  });
  await page.goto(`${base}/review`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(() => window.__s6010NotificationCalls?.length === 1, undefined, {
    timeout: 30_000,
  });
  const first = await page.evaluate(() => window.__s6010NotificationCalls);
  assert.equal(first.length, 1, 'Expected exactly one due-card reminder');
  assert.equal(first[0]?.tag, 'review-reminder', 'Reminder tag is not stable');
  assert.equal(first[0]?.target, '/review', 'Reminder target is not the review surface');
  await page.reload({ waitUntil: 'networkidle' });
  const secondCount = await page.evaluate(() => window.__s6010NotificationCalls?.length ?? 0);
  assert.equal(secondCount, 1, 'Reload created a duplicate reminder');
  assert.deepEqual(failures, [], `Browser errors: ${failures.join(' | ')}`);
  await page.screenshot({ path: `${artifactDir}/review-reminder.png`, fullPage: true });
  await writeFile(`${artifactDir}/evidence.json`, JSON.stringify({ marker, reminderCount: secondCount, target: '/review' }, null, 2));
  console.log(JSON.stringify({ marker, reminderCount: secondCount, target: '/review' }));
} finally {
  await browser?.close();
  await cleanup();
}
