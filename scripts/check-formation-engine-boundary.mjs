import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = process.cwd();
const policyPath = resolve(repositoryRoot, '.formation-engine-boundary.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));

function fail(message) {
  throw new Error(`Formation engine boundary: ${message}`);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map((path) => path.replaceAll('\\', '/'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(resolve(repositoryRoot, path))).digest('hex');
}

if (
  policy.canonicalSource?.classification !== 'private' ||
  policy.canonicalSource?.locationKind !== 'external-private-git' ||
  policy.canonicalSource?.trackedInThisRepository !== false
) {
  fail('the canonical source must remain private, external and untracked');
}

const tracked = trackedFiles();
const gitignore = readFileSync(resolve(repositoryRoot, '.gitignore'), 'utf8')
  .split(/\r?\n/u)
  .map((line) => line.trim());

for (const privateRoot of policy.privateInputRoots ?? []) {
  const normalizedRoot = privateRoot.replace(/^\//u, '').replaceAll('\\', '/');
  if (tracked.some((path) => path.startsWith(normalizedRoot))) {
    fail(`private input is tracked under ${normalizedRoot}`);
  }
  if (!gitignore.includes(`/${normalizedRoot}`)) {
    fail(`private input root /${normalizedRoot} is not explicitly ignored`);
  }
}

for (const publication of policy.publications ?? []) {
  const publicationRoot = publication.root.replaceAll('\\', '/');
  const manifestPath = publication.manifest.replaceAll('\\', '/');
  if (!tracked.includes(manifestPath)) fail(`${manifestPath} is not tracked`);

  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'));
  if (manifest.provenance?.canonicalPrivateSourceFilesIncluded !== false) {
    fail(`${manifestPath} does not prove that canonical private inputs are excluded`);
  }

  const declaredFiles = new Map(
    (manifest.files ?? []).map((file) => [`${publicationRoot}${file.path}`, file.sha256]),
  );
  const publishedFiles = tracked.filter(
    (path) => path.startsWith(publicationRoot) && path !== manifestPath,
  );

  for (const path of publishedFiles) {
    if (!declaredFiles.has(path)) fail(`${path} is published without provenance metadata`);
    if (sha256(path) !== declaredFiles.get(path)) fail(`${path} differs from its recorded hash`);
  }

  for (const path of declaredFiles.keys()) {
    if (!publishedFiles.includes(path)) fail(`${path} is declared but not tracked`);
  }
}

console.log('Formation engine boundary: OK');
