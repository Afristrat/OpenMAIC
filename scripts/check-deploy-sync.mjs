// Garde-fou anti-dérive : le web et les workers Qalem doivent être épinglés sur le même SHA Git.
// Lecture seule : interroge l'API Coolify, ne déclenche aucun déploiement.
// Usage (coffre, jamais de valeur affichée) :
//   & 'C:\Users\amans\.claude\scripts\invoke-secret.ps1' -Keys COOLIFY_API_TOKEN,COOLIFY_URL -Command 'node scripts/check-deploy-sync.mjs'
// Sortie : code 0 si les deux apps partagent le même SHA, 1 sinon.

const APPS = [
  { role: 'web', name: 'qalem-web-rolling-candidate', uuid: 'bcx5pxyuc9z3lt4jtyjipcqu' },
  { role: 'workers', name: 'qalem-runtime', uuid: 'a14gf0n3u719hnnd2yujrtmr' },
];

const baseUrl = process.env.COOLIFY_URL;
const token = process.env.COOLIFY_API_TOKEN;
if (!baseUrl || !token) {
  console.error(
    '[check-deploy-sync] COOLIFY_URL ou COOLIFY_API_TOKEN absent : lancer via invoke-secret.ps1.',
  );
  process.exit(1);
}

const shas = [];
for (const app of APPS) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/applications/${app.uuid}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error(`[check-deploy-sync] ${app.name} : HTTP ${res.status}`);
    process.exit(1);
  }
  const body = await res.json();
  const sha = body.git_commit_sha;
  const branch = body.git_branch;
  if (!sha || sha === 'HEAD') {
    console.error(
      `[check-deploy-sync] ${app.name} : SHA non épinglé (${sha ?? 'absent'}, branche ${branch}).`,
    );
    process.exit(1);
  }
  console.log(`[check-deploy-sync] ${app.role} (${app.name}) : ${sha}`);
  shas.push({ role: app.role, sha });
}

const distinct = new Set(shas.map((s) => s.sha));
if (distinct.size !== 1) {
  console.error(
    '[check-deploy-sync] DÉRIVE : web et workers ne sont pas sur le même SHA. Redéployer les deux sur un SHA unique.',
  );
  process.exit(1);
}
console.log(`[check-deploy-sync] OK : web et workers sur ${shas[0].sha}.`);
