import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

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
const superAdminEmail = process.env.QALEM_RECIPE_SUPER_ADMIN ?? 'Amine@qalem.ma';
const anonKey = process.env.QALEM_SUPABASE_ANON_KEY;
const serviceKey = process.env.QALEM_SUPABASE_SERVICE_ROLE_KEY;
const configureHanae = process.env.QALEM_RECIPE_CONFIGURE_HANAE === 'true';

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
};

const availableAvatars = [
  '/avatars/teacher.png',
  '/avatars/teacher-2.png',
  '/avatars/assist.png',
  '/avatars/assist-2.png',
  '/avatars/clown.png',
  '/avatars/clown-2.png',
  '/avatars/curious.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker.png',
  '/avatars/thinker-2.png',
];

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
  const usersUrl = new URL(`${supabaseUrl}/auth/v1/admin/users`);
  usersUrl.searchParams.set('page', '1');
  usersUrl.searchParams.set('per_page', '1000');
  const { body: users } = await jsonRequest(
    usersUrl,
    { headers: serviceHeaders },
    'Lecture des utilisateurs',
  );
  if (!users?.users?.some((user) => user.email?.toLowerCase() === email.toLowerCase())) {
    throw new Error('Le super-administrateur de recette n’existe pas');
  }

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

async function validateSuperAdminReturn(session, tenantName) {
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
    await page.addInitScript(() => localStorage.setItem('locale', 'fr-FR'));
    await page.goto(`${appUrl}/app?orgId=${encodeURIComponent(orgId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const banner = page.getByRole('status');
    await banner.waitFor({ state: 'visible', timeout: 30_000 });
    const bannerText = await banner.innerText();
    if (!bannerText.includes(`Mode test du tenant : ${tenantName}`)) {
      throw new Error(`Bannière de test divergente : ${bannerText}`);
    }
    const cachedTenantId = await page.evaluate(() => localStorage.getItem('qalem-current-org-id'));
    if (cachedTenantId !== orgId) {
      throw new Error('Le tenant testé n’est pas le contexte actif du navigateur');
    }
    const returnButton = banner.getByRole('button', {
      name: 'Quitter le mode test et revenir à mon espace super-administrateur',
    });
    await returnButton.click();
    await page.waitForURL(`${appUrl}/admin?tab=tenants`, { timeout: 30_000 });
    const remainingTenantId = await page.evaluate(() =>
      localStorage.getItem('qalem-current-org-id'),
    );
    if (remainingTenantId !== null) {
      throw new Error('Le contexte tenant reste mémorisé après la sortie du mode test');
    }
    const adminResponse = await page.request.get(`${appUrl}/api/account/is-admin`);
    const adminBody = await adminResponse.json();
    if (!adminResponse.ok() || adminBody?.isAdmin !== true) {
      throw new Error('La session a perdu son rôle de super-administrateur');
    }
    return {
      bannerText,
      returnUrl: `${appUrl}/admin?tab=tenants`,
      tenantContextCleared: true,
      isSuperAdmin: true,
    };
  } finally {
    await browser.close();
  }
}

async function exactCount(table) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('org_id', `eq.${orgId}`);
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { ...serviceHeaders, prefer: 'count=exact' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Comptage ${table}: HTTP ${response.status}`);
  const range = response.headers.get('content-range');
  const total = range?.split('/')[1];
  if (!total || total === '*') throw new Error(`Comptage ${table}: total absent`);
  return Number(total);
}

function assertAgentContract(agents, settings) {
  if (!Array.isArray(agents) || agents.length !== 10) {
    throw new Error(`Casting incomplet : ${agents?.length ?? 0}/10`);
  }
  const mechanismIds = agents.map((agent) => agent.mechanismId);
  if (new Set(mechanismIds).size !== 10) throw new Error('Mécanismes dupliqués dans le casting');
  if (new Set(agents.map((agent) => agent.id)).size !== 10) {
    throw new Error('Identifiants d’agents dupliqués');
  }
  for (const agent of agents) {
    if (
      !agent.name ||
      !agent.gender ||
      !agent.avatar ||
      !agent.voiceConfig?.providerId ||
      !agent.voiceConfig?.voiceId
    ) {
      throw new Error(`Identité incomplète pour ${agent.mechanismId ?? 'mécanisme inconnu'}`);
    }
  }

  const professor = agents.find((agent) => agent.mechanismId === 'professor');
  const savedProfessor = settings?.learningDesign?.personas?.find(
    (persona) => persona.id === 'professor',
  );
  const legacyProfessor = settings?.teachingProfile;
  const expectedName = savedProfessor?.defaultName ?? legacyProfessor?.name;
  const expectedAvatar = savedProfessor?.avatar ?? legacyProfessor?.avatar;
  const expectedVoiceId = savedProfessor?.voiceId ?? legacyProfessor?.voiceId;
  if (expectedName && professor?.name !== expectedName) {
    throw new Error(`Nom du professeur divergent : ${professor?.name ?? 'absent'}`);
  }
  if (expectedAvatar && professor?.avatar !== expectedAvatar) {
    throw new Error(`Avatar du professeur divergent : ${professor?.avatar ?? 'absent'}`);
  }
  if (expectedVoiceId && professor?.voiceConfig?.voiceId !== expectedVoiceId) {
    throw new Error(
      `Voix du professeur divergente : ${professor?.voiceConfig?.voiceId ?? 'absente'}`,
    );
  }
  return professor;
}

const [{ body: organizations }, session] = await Promise.all([
  jsonRequest(
    `${supabaseUrl}/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}&select=id,name,settings`,
    { headers: serviceHeaders },
    'Lecture du tenant Human Yo Impact',
  ),
  magicLinkSession(superAdminEmail),
]);
let organization = organizations?.[0];
if (!organization) throw new Error('Tenant Human Yo Impact introuvable');

if (configureHanae) {
  const currentLearningDesign = organization.settings?.learningDesign;
  const configuredLearningDesign = currentLearningDesign
    ? {
        ...currentLearningDesign,
        personas: currentLearningDesign.personas.map((persona) =>
          persona.id === 'professor'
            ? {
                ...persona,
                defaultName: 'Hanae',
                gender: 'female',
                avatar: '/avatars/teacher-2.png',
                providerId: 'higgs-tts',
                voiceId: 'hanae',
              }
            : persona,
        ),
      }
    : undefined;
  const { body: update } = await jsonRequest(
    `${appUrl}/api/organizations/${encodeURIComponent(orgId)}`,
    {
      method: 'PATCH',
      headers: { cookie: sessionCookie(session), 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: {
          ...(configuredLearningDesign ? { learningDesign: configuredLearningDesign } : {}),
          teachingProfile: {
            name: 'Hanae',
            avatar: '/avatars/teacher-2.png',
            providerId: 'higgs-tts',
            voiceId: 'hanae',
          },
        },
      }),
    },
    'Configuration de la formatrice Human Yo Impact',
  );
  organization = update?.organization;
  const configuredProfessor = organization?.settings?.learningDesign?.personas?.find(
    (persona) => persona.id === 'professor',
  );
  if (
    organization?.settings?.teachingProfile?.name !== 'Hanae' ||
    (configuredLearningDesign && configuredProfessor?.defaultName !== 'Hanae')
  ) {
    throw new Error('La configuration de Hanae n’est pas persistée');
  }
}

const before = {
  courses: await exactCount('courses'),
  stages: await exactCount('stages'),
};
const superAdminReturn = await validateSuperAdminReturn(session, organization.name);
if (process.env.QALEM_RECIPE_RETURN_ONLY === 'true') {
  console.log(
    JSON.stringify({
      tenant: organization.name,
      superAdminReturn,
      generationSkipped: true,
    }),
  );
  process.exit(0);
}
const { response, body } = await jsonRequest(
  `${appUrl}/api/generate/agent-profiles`,
  {
    method: 'POST',
    headers: {
      cookie: sessionCookie(session),
      'content-type': 'application/json',
      'idempotency-key': `s6031-casting-${randomUUID()}`,
    },
    body: JSON.stringify({
      orgId,
      stageInfo: {
        name: 'Recette de cohérence du casting Human Yo Impact',
        description: 'Formation professionnelle pour organismes à but non lucratif au Québec.',
      },
      sceneOutlines: [
        {
          title: 'Positionnement et influence',
          description: 'Clarifier un message à forte valeur pour les parties prenantes.',
        },
      ],
      languageDirective: 'Rédiger en français professionnel naturel.',
      availableAvatars,
      avatarDescriptions: availableAvatars.map((path) => ({ path, desc: path })),
    }),
  },
  'Génération automatique du casting Human Yo Impact',
);
if (body?.success !== true) throw new Error('La génération automatique n’est pas confirmée');
const professor = assertAgentContract(body.agents, organization.settings);

const after = {
  courses: await exactCount('courses'),
  stages: await exactCount('stages'),
};
if (before.courses !== after.courses || before.stages !== after.stages) {
  throw new Error('La recette isolée a modifié une formation existante');
}

console.log(
  JSON.stringify({
    tenant: organization.name,
    httpStatus: response.status,
    agentCount: body.agents.length,
    mechanismCount: new Set(body.agents.map((agent) => agent.mechanismId)).size,
    professor: {
      mechanismId: professor.mechanismId,
      name: professor.name,
      gender: professor.gender,
      avatar: professor.avatar,
      providerId: professor.voiceConfig.providerId,
      voiceId: professor.voiceConfig.voiceId,
    },
    courseCountBefore: before.courses,
    courseCountAfter: after.courses,
    stageCountBefore: before.stages,
    stageCountAfter: after.stages,
    existingCoursesUntouched: true,
    tenantTeacherConfigured: configureHanae,
    superAdminReturn,
  }),
);
