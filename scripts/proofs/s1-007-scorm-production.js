import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const appUrl = process.env.QALEM_PROOF_APP_URL ?? 'https://qalem.ma';
const outputPath = process.env.QALEM_PROOF_OUTPUT;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const format = process.env.QALEM_PROOF_FORMAT ?? 'scorm12';
const artifactExtensions = {
  scorm12: 'scorm12.zip',
  scorm2004: 'scorm2004.zip',
  cmi5: 'cmi5.zip',
};

assert(supabaseUrl && anonKey && serviceKey, 'Configuration runtime Supabase absente');
assert(outputPath, 'QALEM_PROOF_OUTPUT est requis');
assert(format in artifactExtensions, `Format LMS non pris en charge : ${format}`);

const marker = `s1007-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const users = [];
let organizationId;
let stageId;
let exportId;
let storagePath;
let storageDeleted = false;

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Les contrôles de preuve ne consignent jamais un corps inattendu.
  }
  return { response, body };
}

function payload(body) {
  return body?.data ?? body;
}

async function service(path, options = {}) {
  return json(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(options.headers ?? {}),
    },
  });
}

async function createSession() {
  const email = `${marker}@example.invalid`;
  const password = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
  const created = await service('/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.response.status, 200, 'Création du compte de recette');
  users.push(created.body.id);

  const signedIn = await json(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(signedIn.response.status, 200, 'Connexion du compte de recette');
  return `sb-db-auth-token=base64-${Buffer.from(JSON.stringify(signedIn.body)).toString('base64url')}`;
}

async function app(path, cookie, options = {}) {
  return json(`${appUrl}${path}`, {
    ...options,
    headers: { origin: appUrl, cookie, ...(options.headers ?? {}) },
  });
}

async function cleanup() {
  if (storagePath) {
    const deleted = await service(`/storage/v1/object/exports/${encodeURIComponent(storagePath)}`, {
      method: 'DELETE',
    });
    assert([200, 204].includes(deleted.response.status), 'Suppression Storage de recette');
    storageDeleted = true;
  }
  if (organizationId) {
    await service(`/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    organizationId = undefined;
  }
  for (const id of users.splice(0)) {
    await service(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

async function main() {
  const summary = { marker, format };
  try {
    const cookie = await createSession();
    const ownerId = users[0];
    organizationId = crypto.randomUUID();
    stageId = crypto.randomUUID();

    const organization = await service('/rest/v1/organizations', {
      method: 'POST',
      headers: { Prefer: 'return=representation', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: organizationId,
        name: `S1-007 ${marker}`,
        default_locale: 'fr-FR',
        status: 'active',
        seat_limit: 1,
      }),
    });
    assert.equal(organization.response.status, 201, 'Organisation de recette');

    const membership = await service('/rest/v1/org_members', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: ownerId, org_id: organizationId, role: 'admin' }),
    });
    assert.equal(membership.response.status, 201, 'Adhésion de recette');

    const stage = await service('/rest/v1/stages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: stageId,
        owner_id: ownerId,
        org_id: organizationId,
        name: `SCORM ${marker}`,
        description: 'Recette autonome de paquet SCORM Qalem.',
        language: 'fr-FR',
        agent_ids: ['director'],
      }),
    });
    assert.equal(stage.response.status, 201, 'Formation de recette');

    const scenes = await service('/rest/v1/scenes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          id: crypto.randomUUID(),
          stage_id: stageId,
          type: 'introduction',
          order: 0,
          title: 'Situation professionnelle',
          content: { type: 'text', text: 'Décrivez une situation réelle avant de choisir votre prochaine action.' },
          actions: [],
        },
        {
          id: crypto.randomUUID(),
          stage_id: stageId,
          type: 'quiz',
          order: 1,
          title: 'Choix de transfert',
          content: {
            type: 'quiz',
            questions: [
              {
                id: 'transfer',
                type: 'single',
                question: 'Quelle action pouvez-vous appliquer dès cette semaine ?',
                options: [{ label: 'Préparer un échange avec mon équipe', value: 'prepare' }],
                answer: ['prepare'],
                points: 1,
              },
            ],
          },
          actions: [],
        },
      ]),
    });
    assert.equal(scenes.response.status, 201, 'Scènes de recette');

    const created = await app('/api/export-jobs', cookie, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageId, format }),
    });
    assert.equal(created.response.status, 202, 'Création du job SCORM');
    exportId = payload(created.body)?.id;
    assert.equal(typeof exportId, 'string', 'Identifiant de job absent');

    let job;
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const polled = await app(`/api/export-jobs/${exportId}`, cookie);
      assert.equal(polled.response.status, 200, 'Lecture du job SCORM');
      job = payload(polled.body);
      if (job?.done) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    assert.equal(job?.status, 'done', `Job SCORM non terminé : ${job?.status ?? 'inconnu'}`);
    assert.equal(job?.sceneCount, 2, 'Nombre de scènes exportées');
    storagePath = `${stageId}/${exportId}.${artifactExtensions[format]}`;

    const download = await fetch(`${appUrl}/api/export-jobs/${exportId}?download=1`, {
      headers: { cookie },
      redirect: 'follow',
    });
    assert.equal(download.status, 200, 'Téléchargement privé du paquet SCORM');
    const archive = Buffer.from(await download.arrayBuffer());
    assert(archive.subarray(0, 2).equals(Buffer.from('PK')), 'Archive SCORM ZIP invalide');
    await writeFile(outputPath, archive);
    summary.exportId = exportId;
    summary.sceneCount = job.sceneCount;
    summary.bytes = archive.length;
  } finally {
    await cleanup();
    if (summary.exportId) {
      console.log(JSON.stringify({ ...summary, storageDeleted }));
    }
  }
}

main().catch((error) => {
  console.error(`S1-007:${error instanceof Error ? error.message : 'PROOF_FAILURE'}`);
  process.exitCode = 1;
});
