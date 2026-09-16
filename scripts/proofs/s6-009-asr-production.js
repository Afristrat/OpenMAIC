import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base = 'https://qalem.ma';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(supabaseUrl && anon && service, 'Missing required runtime configuration');

const marker = `s6009-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const languages = [
  { code: 'fr', config: 'fr_fr', label: 'français' },
  { code: 'ar', config: 'ar_eg', label: 'arabe standard' },
  { code: 'en', config: 'en_us', label: 'anglais' },
];
const users = [];
let organizationId;
let stage = 'initialisation';

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    // Production failures are recorded by HTTP status only.
  }
  return { status: response.status, payload };
}

async function serviceRequest(path, options = {}) {
  return json(`${supabaseUrl}${path}`, {
    ...options,
    headers: { apikey: service, Authorization: `Bearer ${service}`, ...(options.headers ?? {}) },
  });
}

async function session() {
  const email = `${marker}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const user = await serviceRequest('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(user.status, 200);
  users.push(user.payload.id);
  const signed = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signed.status, 200);
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  return {
    userId: user.payload.id,
    cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(signed.payload)).toString('base64url')}`,
  };
}

async function app(user, path, form) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { origin: base, cookie: user.cookie },
    body: form,
  });
}

function words(value, language) {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase(language)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return normalized.split(/\s+/u).filter(Boolean);
}

function wordErrorRate(reference, hypothesis, language) {
  const expected = words(reference, language);
  const actual = words(hypothesis, language);
  const table = Array.from({ length: expected.length + 1 }, (_, i) => [i]);
  for (let column = 1; column <= actual.length; column += 1) table[0][column] = column;
  for (let row = 1; row <= expected.length; row += 1) {
    for (let column = 1; column <= actual.length; column += 1) {
      table[row][column] = Math.min(
        table[row - 1][column] + 1,
        table[row][column - 1] + 1,
        table[row - 1][column - 1] + Number(expected[row - 1] !== actual[column - 1]),
      );
    }
  }
  return expected.length === 0 ? null : table[expected.length][actual.length] / expected.length;
}

async function fleur(config, offset = 0) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=google%2Ffleurs&config=${config}&split=validation&offset=${offset}&length=1`;
  let source;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    source = await fetch(url);
    if (source.status === 200) break;
    if (attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  if (source.status !== 200) throw new Error(`Corpus metadata HTTP ${source.status}`);
  const dataset = await source.json();
  const row = dataset.rows?.[0]?.row;
  const audioEntry = Array.isArray(row?.audio) ? row.audio[0] : row?.audio;
  if (typeof row?.transcription !== 'string' || typeof audioEntry?.src !== 'string') {
    throw new Error(
      `Corpus row unavailable: audio=${typeof audioEntry}/${Object.keys(audioEntry ?? {}).join(',')}`,
    );
  }
  const audio = await fetch(audioEntry.src);
  if (audio.status !== 200) throw new Error(`Corpus audio HTTP ${audio.status}`);
  const bytes = Buffer.from(await audio.arrayBuffer());
  return {
    reference: row.transcription,
    type: audioEntry.type ?? 'audio/wav',
    bytes,
    durationSeconds: pcmWav(bytes).data.length / pcmWav(bytes).byteRate,
  };
}

function pcmWav(bytes) {
  if (
    bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    bytes.subarray(8, 12).toString('ascii') !== 'WAVE'
  ) {
    throw new Error('FLEURS audio is not a WAV container');
  }
  let offset = 12;
  let format;
  let data;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString('ascii');
    const size = bytes.readUInt32LE(offset + 4);
    const value = bytes.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') format = value;
    if (id === 'data') data = value;
    offset += 8 + size + (size % 2);
  }
  if (!format || !data || format.length < 16) {
    throw new Error('FLEURS WAV has no usable format or data chunk');
  }
  return { format, data, byteRate: format.readUInt32LE(8) };
}

async function transcribe(user, language, sample, kind) {
  const form = new FormData();
  form.set('orgId', organizationId);
  form.set('providerId', 'openai-whisper');
  form.set('language', language.code);
  form.set(
    'audio',
    new Blob([sample.bytes], { type: sample.type }),
    `${language.code}-${kind}.wav`,
  );
  const started = performance.now();
  const response = await app(user, '/api/transcription', form);
  const body = await response.json().catch(() => undefined);
  const latencyMs = Math.round(performance.now() - started);
  if (response.status !== 200) throw new Error(`Transcription HTTP ${response.status}`);
  if (typeof body?.text !== 'string' || body.text.trim().length === 0) {
    throw new Error('Transcription without text');
  }
  return {
    kind,
    status: response.status,
    latencyMs,
    referenceWords: words(sample.reference, language.code).length,
    hypothesisWords: words(body.text, language.code).length,
    wordErrorRate: Number(wordErrorRate(sample.reference, body.text, language.code).toFixed(4)),
    ...(sample.durationSeconds
      ? { durationSeconds: Number(sample.durationSeconds.toFixed(2)) }
      : {}),
  };
}

async function cleanup() {
  if (organizationId) {
    await serviceRequest(`/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    organizationId = undefined;
  }
  for (const id of users.splice(0)) {
    await serviceRequest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

async function main() {
  const summary = { corpus: 'FLEURS validation, parole humaine', languages: [] };
  try {
    stage = 'compte';
    const user = await session();
    const organization = await serviceRequest('/rest/v1/organizations', {
      method: 'POST',
      headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `S6-009 ${marker}`,
        default_locale: 'fr-FR',
        status: 'active',
        seat_limit: 1,
      }),
    });
    assert.equal(organization.status, 201);
    organizationId = organization.payload?.[0]?.id;
    assert(typeof organizationId === 'string');
    const membership = await serviceRequest('/rest/v1/org_members', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.userId, org_id: organizationId, role: 'admin' }),
    });
    assert.equal(membership.status, 201);
    for (const language of languages) {
      stage = `parole-${language.code}`;
      const samples = await Promise.all(
        Array.from({ length: 2 }, (_, offset) => fleur(language.config, offset)),
      );
      samples.sort((left, right) => left.durationSeconds - right.durationSeconds);
      summary.languages.push({
        language: language.label,
        short: await transcribe(user, language, samples[0], 'short'),
        long: await transcribe(user, language, samples.at(-1), 'long'),
      });
    }
    await cleanup();
    console.log(JSON.stringify(summary));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`${stage}:${error instanceof Error ? error.message : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});
