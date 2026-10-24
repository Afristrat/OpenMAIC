// Worker CI auto-hébergé : rejoue les étapes `run:` du job `check` de
// .github/workflows/ci.yml, dans le même ordre, sans dépendre des runners GitHub
// (Actions est coupé sur ce fork : « Workflows are not currently being run on this
// fork due to the scale of GitHub Actions usage »).
// La source de vérité reste le workflow : ce script le lit, il ne le duplique pas.
//
//   pnpm ci:local                  sur ce poste, arrêt à la première étape en échec
//   pnpm ci:local --keep-going     toutes les étapes, bilan final
//   pnpm ci:local --skip-build     sans `pnpm build` (cas du hook pre-push)
//   pnpm ci:local --remote         FIDÈLE À LA CI : le commit HEAD (poussé en miroir,
//                                  historique complet, fins de ligne LF) est rejoué sur serveuria,
//                                  Linux, node 22, pnpm de ci.yml, install figée.
//                                  C'est ce mode qui a valeur de preuve : les copies de
//                                  travail Windows sont en CRLF et masquent des échecs.
//
// Variables : CI_LOCAL_HOST (défaut serveuria@192.168.100.24), CI_LOCAL_KEY (défaut
// ~/.ssh/serveurai_mnemo), CI_LOCAL_SKIP_BUILD=1.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const keepGoing = args.has('--keep-going');
const remote = args.has('--remote');
const skipBuild = args.has('--skip-build') || process.env.CI_LOCAL_SKIP_BUILD === '1';

const workflow = fs.readFileSync(path.join('.github', 'workflows', 'ci.yml'), 'utf8');
const job = workflow
  .split(/^ {2}[\w-]+:\s*$/m)
  .find((block) => /name: Typecheck, Lint/.test(block));
if (!job) throw new Error('Job `check` introuvable dans .github/workflows/ci.yml');

const steps = [...job.matchAll(/^\s+(?:- name: (.+)\n\s+)?(?:- )?run: (.+)$/gm)].map((m) => ({
  name: (m[1] ?? m[2]).trim(),
  command: m[2].trim(),
}));
const pnpmVersion = job.match(/version:\s*([\d.]+)/)?.[1];
if (remote && !pnpmVersion) throw new Error('Version de pnpm introuvable dans ci.yml');

const host = process.env.CI_LOCAL_HOST ?? 'serveuria@192.168.100.24';
const key = process.env.CI_LOCAL_KEY ?? path.join(os.homedir(), '.ssh', 'serveurai_mnemo');
const ssh = `ssh -i "${key}" -o BatchMode=yes -o ConnectTimeout=15 ${host}`;
const workDir = `/tmp/ci-local-${Date.now()}`;

// Étapes propres au runner Linux de GitHub, ou déjà satisfaites par le mode choisi.
const hostOnly = remote ? /^sudo apt-get/ : /^(sudo apt-get|pnpm install --frozen-lockfile)/;
// Mode poste : les fichiers Windows sont en CRLF alors que l'index et le runner sont en LF ;
// `--end-of-line auto` n'accepte que l'un ou l'autre, jamais un formatage réellement faux.
const adaptLocal = (command) =>
  command === 'pnpm check' ? 'pnpm exec prettier . --check --end-of-line auto' : command;
// Mode serveuria : la commande du workflow, telle quelle, avec le pnpm épinglé par ci.yml.
const toRemote = (command) =>
  `${ssh} "cd ${workDir} && ${command.replace(/^pnpm\b/, `npx -y pnpm@${pnpmVersion}`)}"`;

if (remote) {
  // Comme `actions/checkout` avec fetch-depth 0 : l'historique complet est nécessaire,
  // le contrôle de provenance relit des commits anciens. Un dépôt miroir persistant sur
  // serveuria ne reçoit que les objets nouveaux ; le commit HEAD y est ensuite extrait
  // sous Linux (fins de ligne LF, .gitattributes appliqué), comme le fait le runner.
  console.log(`=== Envoi de HEAD (${host}:${workDir})`);
  const gitSsh = `ssh -i "${key}" -o BatchMode=yes -o ConnectTimeout=15`;
  const run = (command, env = {}) =>
    spawnSync(command, { shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
  // Le `+` du refspec réécrit la branche jetable ci-head du miroir, jamais une branche du dépôt.
  const sent = [
    () => run(`${ssh} "git init --bare -q ci-local-mirror.git"`),
    () =>
      run(`git push -q ${host}:ci-local-mirror.git +HEAD:refs/heads/ci-head`, {
        GIT_SSH_COMMAND: gitSsh,
      }),
    () => run(`${ssh} "git clone -q -b ci-head ci-local-mirror.git ${workDir}"`),
  ].reduce((last, next) => (last.status === 0 ? next() : last), { status: 0 });
  if (sent.status !== 0) {
    console.error('Envoi de HEAD impossible : serveuria joignable ? clé SSH valide ?');
    process.exit(1);
  }
}

const results = [];
for (const step of steps) {
  if (hostOnly.test(step.command)) continue;
  if (skipBuild && step.command === 'pnpm build') continue;
  const command = remote ? toRemote(step.command) : adaptLocal(step.command);
  console.log(`\n=== ${step.name} :: ${remote ? 'serveuria ' : ''}${step.command}`);
  const started = Date.now();
  const { status } = spawnSync(command, { shell: true, stdio: 'inherit' });
  results.push({
    name: step.name,
    ok: status === 0,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  if (status !== 0 && !keepGoing) break;
}

if (remote) spawnSync(`${ssh} "rm -rf ${workDir}"`, { shell: true, stdio: 'inherit' });

console.log(`\n=== Bilan CI ${remote ? 'serveuria (Linux, HEAD)' : 'locale (copie de travail)'}`);
for (const r of results) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${r.name} (${r.seconds} s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
