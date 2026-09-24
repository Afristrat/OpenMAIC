import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const required = ['QALEM_SUPABASE_ANON_KEY', 'QALEM_SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Variable requise absente : ${name}`);
}
if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S1-005-IMPORT') {
  throw new Error('Confirmation de recette de production absente');
}

const supabaseUrl = process.env.QALEM_SUPABASE_URL ?? 'https://db.qalem.ma';
const appUrl = process.env.QALEM_APP_URL ?? 'https://qalem.ma';
const anonKey = process.env.QALEM_SUPABASE_ANON_KEY;
const serviceKey = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const marker = `s1005-${Date.now()}-${randomUUID()}`;
const email = `${marker}@example.invalid`;
const password = `${randomBytes(30).toString('base64url')}Aa1!`;
const editedTitle = `Décider et agir — ${marker}`;
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authentication = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId;
let orgId;
let stageId;
let courseId;
let importId;
let sourceManifestId;
let originalImportFlag;
let importFlagRead = false;
let fixtureSession;

const canvas = `# Décider quelles tâches automatiser

## Résultat professionnel visé
Choisir une tâche professionnelle récurrente et concevoir une expérimentation réversible.

## Pour qui et dans quel contexte
Responsables opérationnels adultes travaillant dans une petite organisation marocaine.

## Chapitre 1 — Repérer une tâche utile

### Objectif observable
Classer une tâche réelle selon sa stabilité, son volume et son niveau de risque.

### Contenu essentiel
Une tâche adaptée possède une entrée identifiable, une sortie vérifiable et un responsable humain.

### Mise en pratique ou point de contrôle
Comparer deux tâches de son activité et justifier celle qui sera expérimentée en premier.

## Preuve finale d’application
Produire une fiche d’expérimentation de deux semaines avec indicateur de succès et critère d’arrêt.
`;

function checked(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function jsonRequest(url, init, label) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status} (${body?.errorCode ?? 'UNKNOWN'})`);
  }
  return { response, body };
}

function sessionCookieValue(session) {
  return `base64-${Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }),
    'utf8',
  ).toString('base64url')}`;
}

async function setImportFlag(enabled) {
  const { error } = await admin
    .from('feature_flags')
    .update({ enabled })
    .eq('flag_name', 'import_pipeline');
  checked(error, `Mise à jour import_pipeline=${enabled}`);
}

async function createFixture() {
  const { data: flag, error: flagError } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('flag_name', 'import_pipeline')
    .single();
  checked(flagError, 'Lecture du drapeau import_pipeline');
  originalImportFlag = flag.enabled;
  importFlagRead = true;

  const { data: createdUser, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: 'Recette S1-005' },
  });
  checked(userError, 'Création du compte de recette');
  userId = createdUser.user?.id;
  assert(userId, 'Identifiant du compte de recette absent');

  const { data: organization, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: `Recette import ${marker}`,
      sector: 'education',
      default_locale: 'fr-FR',
      status: 'active',
      seat_limit: 1,
    })
    .select('id')
    .single();
  checked(orgError, 'Création du tenant de recette');
  orgId = organization.id;

  const { error: membershipError } = await admin
    .from('org_members')
    .insert({ org_id: orgId, user_id: userId, role: 'admin' });
  checked(membershipError, 'Création de l’administrateur tenant');

  const { data: allocation, error: allocationError } = await admin.rpc('post_tenant_credit_entry', {
    actor_user_id: userId,
    tenant_id: orgId,
    credit_entry_type: 'allocation',
    credit_delta_microunits: 1_000_000_000,
    credit_idempotency_key: `${marker}-allocation`,
    credit_reason: 'Allocation jetable pour la recette S1-005',
  });
  checked(allocationError, 'Allocation des crédits de recette');
  assert.equal(allocation?.[0]?.applied, true, 'L’allocation de recette doit être appliquée');

  const { data: signedIn, error: signInError } = await authentication.auth.signInWithPassword({
    email,
    password,
  });
  checked(signInError, 'Connexion du compte de recette');
  assert(signedIn.session, 'Session du compte de recette absente');
  return signedIn.session;
}

async function pollGeneration(page, jobId) {
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    const response = await page.request.get(
      `${appUrl}/api/generate-classroom/${encodeURIComponent(jobId)}`,
      { timeout: 60_000 },
    );
    const body = await response.json().catch(() => null);
    assert.equal(response.status(), 200, 'Le statut de génération doit rester accessible');
    if (body?.status === 'failed') {
      throw new Error(
        `Génération importée en échec (${body.failureCode ?? 'UNKNOWN'} : ${body.error ?? 'sans détail'})`,
      );
    }
    if (body?.status === 'succeeded') {
      assert.equal(body.progress, 100);
      assert(body.result?.classroomId, 'Identifiant de classe absent du résultat');
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('La génération importée n’a pas terminé dans les trente minutes');
}

async function runBrowserRecipe(session) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
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
    const browserErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await page.addInitScript(
      ({ organizationId }) => {
        localStorage.setItem('locale', 'fr-FR');
        localStorage.setItem('qalem-current-org-id', organizationId);
      },
      { organizationId: orgId },
    );

    await setImportFlag(true);
    await page.goto(`${appUrl}/app?orgId=${encodeURIComponent(orgId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const organizationsResponse = await page.request.get(`${appUrl}/api/organizations`);
    const organizationsBody = await organizationsResponse.json().catch(() => null);
    assert.equal(
      organizationsResponse.status(),
      200,
      'La session navigateur doit être authentifiée',
    );
    assert(
      organizationsBody?.organizations?.some((organization) => organization.id === orgId),
      'Le tenant de recette doit être visible par son administrateur',
    );
    const availabilityResponse = await page.request.get(
      `${appUrl}/api/courses/import?orgId=${encodeURIComponent(orgId)}`,
    );
    const availability = await availabilityResponse.json().catch(() => null);
    assert.equal(availabilityResponse.status(), 200, 'La disponibilité de l’import doit répondre');
    assert.equal(availability?.enabled, true, 'Le drapeau temporaire doit être actif');
    const importButton = page.locator('[data-testid="course-canvas-import"]:visible').first();
    try {
      await importButton.waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      const rendered = (await page.locator('body').innerText()).slice(0, 800).replaceAll('\n', ' ');
      throw new Error(`Bouton d’import absent sur ${page.url()} : ${rendered}`);
    }
    const chooserPromise = page.waitForEvent('filechooser');
    page.once('dialog', (dialog) => dialog.accept());
    await importButton.click();
    const chooser = await chooserPromise;
    const importResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${appUrl}/api/courses/import` && response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await chooser.setFiles({
      name: `${marker}.md`,
      mimeType: 'text/markdown',
      buffer: Buffer.from(canvas, 'utf8'),
    });
    const importResponse = await importResponsePromise;
    const imported = await importResponse.json();
    assert.equal(
      importResponse.status(),
      201,
      `L’import doit être créé (${imported?.error ?? 'erreur sans détail'})`,
    );
    assert.equal(imported.validation?.status, 'conform');
    assert.equal(imported.validation?.language, 'fr-FR');
    assert(Array.isArray(imported.plan?.outlines) && imported.plan.outlines.length >= 2);
    courseId = imported.courseId;
    importId = imported.importId;
    sourceManifestId = imported.sourceManifestId;
    assert(courseId && importId && sourceManifestId, 'Identifiants d’import incomplets');

    await setImportFlag(originalImportFlag);
    await page.getByRole('heading', { name: 'Plan de formation' }).waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    const titleInput = page.getByLabel('Intitulé de la formation', { exact: true });
    await titleInput.fill(editedTitle);
    assert.equal(await titleInput.inputValue(), editedTitle);

    let generationRequest;
    page.on('request', (request) => {
      if (request.url() === `${appUrl}/api/generate-classroom` && request.method() === 'POST') {
        generationRequest = request.postDataJSON();
      }
    });
    const generationResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `${appUrl}/api/generate-classroom` &&
        response.request().method() === 'POST',
      { timeout: 120_000 },
    );
    await page.getByRole('button', { name: 'Confirmer et générer le cours' }).click();
    const generationResponse = await generationResponsePromise;
    const generation = await generationResponse.json();
    assert.equal(generationResponse.status(), 202);
    assert(generation.jobId, 'Identifiant du travail de génération absent');
    assert.equal(generationRequest?.courseId, courseId);
    assert.equal(generationRequest?.sourceManifestId, sourceManifestId);
    assert.equal(generationRequest?.approvedPlan?.courseTitle, editedTitle);
    assert.equal(generationRequest?.learningApproach, 'andragogy');

    const completed = await pollGeneration(page, generation.jobId);
    stageId = completed.result.classroomId;
    await page.goto(`${appUrl}${completed.result.url}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.locator('body').waitFor({ state: 'visible' });

    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('id,title,status,stage_id,import_id,source_manifest_id,outline')
      .eq('id', courseId)
      .single();
    checked(courseError, 'Lecture du cours importé généré');
    assert.equal(course.title, editedTitle);
    assert.equal(course.status, 'ready');
    assert.equal(course.stage_id, stageId);
    assert.equal(course.import_id, importId);
    assert.equal(course.source_manifest_id, sourceManifestId);
    assert.equal(course.outline?.plan?.courseTitle, editedTitle);

    const classroomResponse = await page.request.get(
      `${appUrl}/api/classroom?id=${encodeURIComponent(stageId)}`,
    );
    const classroom = await classroomResponse.json();
    assert.equal(classroomResponse.status(), 200);
    assert(classroom.classroom?.scenes?.length >= 2, 'La classe générée doit contenir ses scènes');
    assert.deepEqual(browserErrors, [], 'Le parcours navigateur ne doit produire aucune erreur');

    return {
      importStatus: importResponse.status(),
      validationStatus: imported.validation.status,
      detectedLanguage: imported.validation.language,
      importedOutlineCount: imported.plan.outlines.length,
      editedTitlePersisted: course.title === editedTitle,
      learningApproach: generationRequest.learningApproach,
      generationStatus: completed.status,
      generatedSceneCount: classroom.classroom.scenes.length,
      courseReady: course.status === 'ready',
      browserErrorCount: browserErrors.length,
    };
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  const failures = [];
  if (importFlagRead) {
    await setImportFlag(originalImportFlag).catch((error) => failures.push(error));
  }

  if (stageId && userId) {
    if (fixtureSession) {
      const response = await fetch(`${appUrl}/api/classroom?id=${encodeURIComponent(stageId)}`, {
        method: 'DELETE',
        headers: { cookie: `sb-db-auth-token=${sessionCookieValue(fixtureSession)}` },
        signal: AbortSignal.timeout(120_000),
      }).catch(() => null);
      if (response && !response.ok && response.status !== 404) {
        failures.push(new Error(`Suppression de la classe : HTTP ${response.status}`));
      }
    }
  }

  if (userId) {
    const { data: imports, error: importsError } = await admin
      .from('course_imports')
      .select('storage_path')
      .eq('owner_id', userId);
    if (importsError) failures.push(importsError);
    const paths = (imports ?? []).map((row) => row.storage_path);
    if (paths.length > 0) {
      const { error } = await admin.storage.from('classroom-media').remove(paths);
      if (error) failures.push(error);
    }
    for (const table of ['classroom_generation_jobs', 'courses', 'course_imports']) {
      const { error } = await admin.from(table).delete().eq('owner_id', userId);
      if (error) failures.push(error);
    }
  }
  if (orgId) {
    const { error } = await admin.from('organizations').delete().eq('id', orgId);
    if (error) failures.push(error);
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) failures.push(error);
  }
  if (failures.length > 0) throw new AggregateError(failures, 'Nettoyage incomplet');
}

async function auditCleanup() {
  const counts = {};
  for (const [table, column, value] of [
    ['organizations', 'id', orgId],
    ['org_members', 'user_id', userId],
    ['courses', 'owner_id', userId],
    ['course_imports', 'owner_id', userId],
    ['classroom_generation_jobs', 'owner_id', userId],
    ['stages', 'id', stageId],
  ]) {
    if (!value) continue;
    const { count, error } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, value);
    checked(error, `Audit de nettoyage ${table}`);
    counts[table] = count;
  }
  assert(
    Object.values(counts).every((count) => count === 0),
    'Des lignes de recette subsistent',
  );
  const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  checked(error, 'Audit du compte de recette');
  assert(!users.users.some((user) => user.id === userId), 'Le compte de recette subsiste');
  return counts;
}

let result;
let recipeError;
try {
  fixtureSession = await createFixture();
  result = await runBrowserRecipe(fixtureSession);
} catch (error) {
  recipeError = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    recipeError = recipeError
      ? new AggregateError([recipeError, cleanupError], 'Recette et nettoyage en échec')
      : cleanupError;
  }
}

let cleanupCounts;
try {
  cleanupCounts = await auditCleanup();
} catch (auditError) {
  recipeError = recipeError
    ? new AggregateError([recipeError, auditError], 'Recette ou audit de nettoyage en échec')
    : auditError;
}
if (recipeError) throw recipeError;
console.log(
  JSON.stringify({
    ...result,
    importFlagRestored: originalImportFlag,
    cleanupCounts,
  }),
);
