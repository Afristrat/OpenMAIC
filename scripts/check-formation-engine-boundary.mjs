import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const repositoryRoot = process.cwd();
const policyPath = resolve(repositoryRoot, '.formation-engine-boundary.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));

function fail(message) {
  throw new Error(`Formation engine boundary: ${message}`);
}

function walkFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    if (!entry.isFile()) return [];
    return [relative(repositoryRoot, path).replaceAll('\\', '/')];
  });
}

function repositoryFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean)
      .map((path) => path.replaceAll('\\', '/'));
  } catch {
    const relevantRoots = [
      ...(policy.privateInputRoots ?? []),
      ...(policy.publications ?? []).map((publication) => publication.root),
    ];
    return relevantRoots.flatMap((path) => {
      const root = resolve(repositoryRoot, path);
      return existsSync(root) ? walkFiles(root) : [];
    });
  }
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

const repositoryFileList = repositoryFiles();
const gitignore = readFileSync(resolve(repositoryRoot, '.gitignore'), 'utf8')
  .split(/\r?\n/u)
  .map((line) => line.trim());

for (const privateRoot of policy.privateInputRoots ?? []) {
  const normalizedRoot = privateRoot.replace(/^\//u, '').replaceAll('\\', '/');
  if (repositoryFileList.some((path) => path.startsWith(normalizedRoot))) {
    fail(`private input is present under ${normalizedRoot}`);
  }
  if (!gitignore.includes(`/${normalizedRoot}`)) {
    fail(`private input root /${normalizedRoot} is not explicitly ignored`);
  }
}

for (const publication of policy.publications ?? []) {
  const publicationRoot = publication.root.replaceAll('\\', '/');
  const manifestPath = publication.manifest.replaceAll('\\', '/');
  if (!repositoryFileList.includes(manifestPath) && !existsSync(resolve(repositoryRoot, manifestPath))) {
    fail(`${manifestPath} is absent`);
  }

  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'));
  if (manifest.provenance?.canonicalPrivateSourceFilesIncluded !== false) {
    fail(`${manifestPath} does not prove that canonical private inputs are excluded`);
  }

  const declaredFiles = new Map(
    (manifest.files ?? []).map((file) => [`${publicationRoot}${file.path}`, file.sha256]),
  );
  const publishedFiles = repositoryFileList.filter(
    (path) => path.startsWith(publicationRoot) && path !== manifestPath,
  );

  for (const path of publishedFiles) {
    if (!declaredFiles.has(path)) fail(`${path} is published without provenance metadata`);
    if (sha256(path) !== declaredFiles.get(path)) fail(`${path} differs from its recorded hash`);
  }

  for (const path of declaredFiles.keys()) {
    if (!publishedFiles.includes(path)) fail(`${path} is declared but absent`);
  }
}

console.log('Formation engine boundary: OK');
