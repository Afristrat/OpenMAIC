import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUILDER_ID = 'qalem-formation-engine-publisher';
const BUILDER_VERSION = 1;
const TARGET_IDS = ['standalone', 'qalem'];
const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.env.local',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
]);
const SENSITIVE_EXTENSIONS = new Set(['.key', '.pem', '.p12', '.pfx']);

function fail(message) {
  throw new Error(`Formation engine publication: ${message}`);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is required`);
  return value.trim();
}

function safeRelativePath(value, label) {
  const path = requireText(value, label).replaceAll('\\', '/');
  if (
    isAbsolute(path) ||
    path.startsWith('/') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    fail(`${label} must stay within its declared root`);
  }
  return path;
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function rejectSensitivePath(path) {
  const lower = path.toLowerCase();
  const basename = lower.split('/').at(-1) ?? '';
  const extensionIndex = basename.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? basename.slice(extensionIndex) : '';
  if (SENSITIVE_BASENAMES.has(basename) || SENSITIVE_EXTENSIONS.has(extension)) {
    fail(`sensitive-looking source path is forbidden: ${path}`);
  }
}

function readApprovedSourceFile(sourceRoot, sourcePath) {
  rejectSensitivePath(sourcePath);
  const absolute = resolve(sourceRoot, sourcePath);
  if (!isWithin(sourceRoot, absolute))
    fail(`source path escapes the canonical root: ${sourcePath}`);
  if (!existsSync(absolute)) fail(`declared source file is absent: ${sourcePath}`);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(`declared source must be a regular non-symlink file: ${sourcePath}`);
  }
  const content = readFileSync(absolute);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(content.toString('utf8'))) {
    fail(`private key material detected in declared source: ${sourcePath}`);
  }
  return content;
}

function validateOutputRoot(sourceRoot, outputRoot) {
  if (isWithin(sourceRoot, outputRoot) || isWithin(outputRoot, sourceRoot)) {
    fail('source and output roots must be separate');
  }
  if (existsSync(outputRoot) && readdirSync(outputRoot).length > 0) {
    fail('output root must be absent or empty to prevent stale artifacts');
  }
}

function validateSourceRevision(sourceRevision) {
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(sourceRevision)) {
    fail('source revision must be a full Git object id');
  }
}

export function buildFormationEnginePublication({ sourceRoot, outputRoot, sourceRevision }) {
  const canonicalRoot = resolve(sourceRoot);
  const destinationRoot = resolve(outputRoot);
  validateSourceRevision(sourceRevision);
  validateOutputRoot(canonicalRoot, destinationRoot);

  const planPath = resolve(canonicalRoot, 'publication-plan.json');
  if (!existsSync(planPath)) fail('publication-plan.json is absent from the canonical source');
  const planBytes = readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  if (plan.schemaVersion !== 1) fail('unsupported publication plan schema');
  const sourceId = requireText(plan.sourceId, 'source id');
  const targetKeys = Object.keys(plan.targets ?? {}).sort();
  if (JSON.stringify(targetKeys) !== JSON.stringify([...TARGET_IDS].sort())) {
    fail(`publication plan must define exactly: ${TARGET_IDS.join(', ')}`);
  }

  const preparedTargets = TARGET_IDS.map((targetId) => {
    const target = plan.targets[targetId];
    if (target?.redistributionApproval?.status !== 'approved') {
      fail(`${targetId} redistribution is not approved`);
    }
    const approvalRef = requireText(
      target.redistributionApproval.reference,
      `${targetId} redistribution approval reference`,
    );
    if (!Array.isArray(target.files) || target.files.length === 0) {
      fail(`${targetId} must publish at least one file`);
    }
    const outputPaths = new Set();
    const files = target.files
      .map((entry) => {
        const sourcePath = safeRelativePath(entry.source, `${targetId} source path`);
        const outputPath = safeRelativePath(entry.path, `${targetId} output path`);
        if (outputPath === 'publication.json') {
          fail(`${targetId} cannot override its generated publication.json`);
        }
        if (outputPaths.has(outputPath)) fail(`${targetId} has duplicate output: ${outputPath}`);
        outputPaths.add(outputPath);
        const content = readApprovedSourceFile(canonicalRoot, sourcePath);
        return { sourcePath, outputPath, content, sha256: sha256(content) };
      })
      .sort((left, right) => left.outputPath.localeCompare(right.outputPath));
    return { targetId, approvalRef, files };
  });

  const planSha256 = sha256(planBytes);
  const targetManifests = preparedTargets.map((target) => {
    const manifest = {
      schemaVersion: 1,
      target: target.targetId,
      builder: { id: BUILDER_ID, version: BUILDER_VERSION },
      provenance: {
        sourceId,
        sourceRevision,
        planSha256,
        redistributionApprovalRef: target.approvalRef,
        privateOnlySourceFilesIncluded: false,
      },
      files: target.files.map((file) => ({ path: file.outputPath, sha256: file.sha256 })),
    };
    const bytes = Buffer.from(stableJson(manifest), 'utf8');
    return { ...target, manifest, manifestBytes: bytes, manifestSha256: sha256(bytes) };
  });

  const publication = {
    schemaVersion: 1,
    builder: { id: BUILDER_ID, version: BUILDER_VERSION },
    provenance: { sourceId, sourceRevision, planSha256, privateOnlySourceFilesIncluded: false },
    targets: targetManifests.map((target) => ({
      id: target.targetId,
      publicationManifestSha256: target.manifestSha256,
      files: target.manifest.files,
    })),
  };

  mkdirSync(destinationRoot, { recursive: true });
  for (const target of targetManifests) {
    const targetRoot = resolve(destinationRoot, target.targetId);
    for (const file of target.files) {
      const output = resolve(targetRoot, file.outputPath);
      if (!isWithin(targetRoot, output)) fail(`output escapes target root: ${file.outputPath}`);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, file.content, { flag: 'wx' });
    }
    mkdirSync(targetRoot, { recursive: true });
    writeFileSync(resolve(targetRoot, 'publication.json'), target.manifestBytes, { flag: 'wx' });
  }
  writeFileSync(resolve(destinationRoot, 'publication.json'), stableJson(publication), {
    encoding: 'utf8',
    flag: 'wx',
  });
  return publication;
}

function parseArgs(argv) {
  if (argv.length !== 4) fail('expected exactly --source <path> --output <path>');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) fail('expected --source and --output');
    if (!['--source', '--output'].includes(key) || values.has(key)) {
      fail(`unsupported or duplicate argument: ${key}`);
    }
    values.set(key, value);
  }
  return {
    sourceRoot: values.get('--source'),
    outputRoot: values.get('--output'),
  };
}

function readCleanGitRevision(sourceRoot) {
  const status = execFileSync(
    'git',
    ['-C', sourceRoot, 'status', '--porcelain', '--untracked-files=all'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  if (status.trim()) fail('canonical source Git worktree is dirty');
  return execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function main() {
  const { sourceRoot, outputRoot } = parseArgs(process.argv.slice(2));
  if (!sourceRoot || !outputRoot) fail('both --source and --output are required');
  const sourceRevision = readCleanGitRevision(sourceRoot);
  const publication = buildFormationEnginePublication({ sourceRoot, outputRoot, sourceRevision });
  console.log(
    `Formation engine publication: OK (${publication.provenance.sourceId}@${sourceRevision})`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
