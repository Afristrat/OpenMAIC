// Worker CI local : rejoue sur le poste les étapes `run:` du job `check` de
// .github/workflows/ci.yml, dans le même ordre, sans dépendre des runners GitHub.
// La source de vérité reste le workflow : ce script le lit, il ne le duplique pas.
//
//   pnpm ci:local                 toutes les étapes, arrêt à la première en échec
//   pnpm ci:local --keep-going    toutes les étapes, bilan final
//   pnpm ci:local --skip-build    sans `pnpm build` (cas du hook pre-push)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const keepGoing = args.has('--keep-going');
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

// Étapes propres au runner Linux ou déjà satisfaites sur le poste.
const hostOnly = /^(sudo apt-get|pnpm install --frozen-lockfile)/;
// Les fichiers du poste Windows sont en CRLF alors que l'index et le runner sont en LF :
// `--end-of-line auto` n'accepte que l'un ou l'autre, jamais un formatage réellement faux.
const adapt = (command) =>
  command === 'pnpm check' ? 'pnpm exec prettier . --check --end-of-line auto' : command;

const results = [];
for (const step of steps) {
  if (hostOnly.test(step.command)) continue;
  if (skipBuild && step.command === 'pnpm build') continue;
  console.log(`\n=== ${step.name} :: ${adapt(step.command)}`);
  const started = Date.now();
  const { status } = spawnSync(adapt(step.command), { shell: true, stdio: 'inherit' });
  results.push({
    name: step.name,
    ok: status === 0,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  if (status !== 0 && !keepGoing) break;
}

console.log('\n=== Bilan CI locale');
for (const r of results) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${r.name} (${r.seconds} s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
