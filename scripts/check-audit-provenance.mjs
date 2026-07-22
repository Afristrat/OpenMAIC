import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'refork', 'audit-provenance.json');

const snapshots = {
  upstream_v01: {
    commit: '1d0514424c69d78b55945a668df7dbfed4686586',
    tree: '35dbbfdefa889077c589980778d75a0261a9d90c',
    declared_license: 'AGPL-3.0',
    license_blob_oid: 'be3f7b28e564e7dd05eaf59d64adba1a4065ac0e',
  },
  legacy_final: {
    tag: 'legacy-v010-final',
    commit: 'a4c8421695820e63be585e166d7ed35829d13369',
    tree: 'cdf3665984ea188f0dcd6a7ccdbbde7932ee260c',
    declared_license: 'AGPL-3.0',
    license_blob_oid: 'be3f7b28e564e7dd05eaf59d64adba1a4065ac0e',
  },
  mit_baseline: {
    repository: 'https://github.com/THU-MAIC/OpenMAIC.git',
    tag: 'v0.3.0',
    upstream_commit: 'da0b394b81745153b0dffd8537d0b2d1b94eaf61',
    import_commit: '14d31aa48d48909d9eb0b17dd35dc793381e2b00',
    import_tree: '179a875db78ac3c8537a556fb0d548173446dd4b',
    declared_license: 'MIT',
    license_blob_oid: '76abc5f13261e94fc0382b33ac8c101555288083',
  },
};

const mappings = {
  'components/chat/process-sse-stream.ts': {
    disposition: 'removed_obsolete',
    mit_sources: ['lib/agent/runtime/stream-fn.ts', 'lib/hooks/use-streaming-text.ts'],
    outputs: ['lib/agent/runtime/stream-fn.ts', 'lib/hooks/use-streaming-text.ts'],
  },
  'components/settings/audio-settings.tsx': {
    disposition: 'removed_obsolete',
    mit_sources: [
      'components/settings/tts-settings.tsx',
      'components/settings/asr-settings.tsx',
      'components/settings/provider-list.tsx',
    ],
    outputs: [
      'components/settings/tts-settings.tsx',
      'components/settings/asr-settings.tsx',
      'components/settings/provider-list.tsx',
    ],
  },
  'components/settings/model-selector.tsx': {
    disposition: 'removed_obsolete',
    mit_sources: [
      'components/ai-elements/model-selector.tsx',
      'components/settings/model-edit-dialog.tsx',
    ],
    outputs: [
      'components/ai-elements/model-selector.tsx',
      'components/settings/model-edit-dialog.tsx',
    ],
  },
  'components/slide-renderer/components/ThumbnailSlide/ThumbnailElement.tsx': {
    disposition: 'removed_obsolete',
    mit_sources: ['components/slide-renderer/SlideThumbnail.tsx'],
    outputs: ['components/slide-renderer/SlideThumbnail.tsx'],
  },
  'components/slide-renderer/components/ThumbnailSlide/index.tsx': {
    disposition: 'removed_obsolete',
    mit_sources: ['components/slide-renderer/SlideThumbnail.tsx'],
    outputs: ['components/slide-renderer/SlideThumbnail.tsx'],
  },
  'lib/generation/prompts/index.ts': promptMapping('lib/prompts/index.ts'),
  'lib/generation/prompts/loader.ts': promptMapping('lib/prompts/loader.ts'),
  'lib/generation/prompts/snippets/action-types.md': promptMapping(
    'lib/prompts/snippets/action-types.md',
  ),
  'lib/generation/prompts/snippets/element-types.md': promptMapping(
    'lib/prompts/snippets/element-types.md',
  ),
  'lib/generation/prompts/snippets/json-output-rules.md': promptMapping(
    'lib/prompts/snippets/json-output-rules.md',
  ),
  'lib/generation/prompts/templates/interactive-actions/system.md': promptMapping(
    'lib/prompts/templates/interactive-actions/system.md',
  ),
  'lib/generation/prompts/templates/interactive-actions/user.md': promptMapping(
    'lib/prompts/templates/interactive-actions/user.md',
  ),
  'lib/generation/prompts/templates/interactive-html/system.md': obsoletePromptMapping([
    'lib/prompts/templates/interactive-outlines/system.md',
    'lib/prompts/templates/simulation-content/system.md',
  ]),
  'lib/generation/prompts/templates/interactive-html/user.md': obsoletePromptMapping([
    'lib/prompts/templates/interactive-outlines/user.md',
    'lib/prompts/templates/simulation-content/user.md',
  ]),
  'lib/generation/prompts/templates/interactive-scientific-model/system.md': obsoletePromptMapping([
    'lib/prompts/templates/simulation-content/system.md',
    'lib/prompts/templates/visualization3d-content/system.md',
  ]),
  'lib/generation/prompts/templates/interactive-scientific-model/user.md': obsoletePromptMapping([
    'lib/prompts/templates/simulation-content/user.md',
    'lib/prompts/templates/visualization3d-content/user.md',
  ]),
  'lib/generation/prompts/templates/pbl-actions/system.md': promptMapping(
    'lib/prompts/templates/pbl-actions/system.md',
  ),
  'lib/generation/prompts/templates/pbl-actions/user.md': promptMapping(
    'lib/prompts/templates/pbl-actions/user.md',
  ),
  'lib/generation/prompts/templates/quiz-actions/system.md': promptMapping(
    'lib/prompts/templates/quiz-actions/system.md',
  ),
  'lib/generation/prompts/templates/quiz-actions/user.md': promptMapping(
    'lib/prompts/templates/quiz-actions/user.md',
  ),
  'lib/generation/prompts/templates/quiz-content/system.md': promptMapping(
    'lib/prompts/templates/quiz-content/system.md',
  ),
  'lib/generation/prompts/templates/quiz-content/user.md': promptMapping(
    'lib/prompts/templates/quiz-content/user.md',
  ),
  'lib/generation/prompts/templates/requirements-to-outlines/system.md': promptMapping(
    'lib/prompts/templates/requirements-to-outlines/system.md',
  ),
  'lib/generation/prompts/templates/requirements-to-outlines/user.md': promptMapping(
    'lib/prompts/templates/requirements-to-outlines/user.md',
  ),
  'lib/generation/prompts/templates/slide-actions/system.md': promptMapping(
    'lib/prompts/templates/slide-actions/system.md',
  ),
  'lib/generation/prompts/templates/slide-actions/user.md': promptMapping(
    'lib/prompts/templates/slide-actions/user.md',
  ),
  'lib/generation/prompts/templates/slide-content/system.md': promptMapping(
    'lib/prompts/templates/slide-content/system.md',
  ),
  'lib/generation/prompts/templates/slide-content/user.md': promptMapping(
    'lib/prompts/templates/slide-content/user.md',
  ),
  'lib/generation/prompts/types.ts': promptMapping('lib/prompts/types.ts'),
  'lib/i18n/chat.ts': localeMapping(),
  'lib/i18n/common.ts': localeMapping(),
  'lib/i18n/generation.ts': localeMapping(),
  'lib/i18n/settings.ts': localeMapping(),
  'lib/i18n/stage.ts': localeMapping(),
  'lib/types/slides.ts': {
    disposition: 'mapped_to_mit',
    mit_sources: ['packages/@openmaic/dsl/src/slides.ts'],
    outputs: ['packages/@openmaic/dsl/src/slides.ts'],
  },
};

function promptMapping(equivalent) {
  return {
    disposition: 'derived_from_mit',
    mit_sources: [equivalent],
    outputs: [equivalent],
  };
}

function obsoletePromptMapping(replacements) {
  return {
    disposition: 'removed_obsolete',
    mit_sources: replacements,
    outputs: replacements,
  };
}

function localeMapping() {
  return {
    disposition: 'rewritten_from_mit',
    mit_sources: [
      'lib/i18n/config.ts',
      'lib/i18n/index.ts',
      'lib/i18n/locales/en-US.json',
      'lib/i18n/locales/ar-SA.json',
    ],
    outputs: [
      'lib/i18n/config.ts',
      'lib/i18n/index.ts',
      'lib/i18n/locales/ui-en-US.json',
      'lib/i18n/locales/ui-fr-FR.json',
      'lib/i18n/locales/ui-ar-MA.json',
      'refork/i18n-cleanroom-contract.json',
      'refork/i18n-dynamic-keys.json',
      'refork/i18n-cleanroom-method.md',
    ],
  };
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function listTree(commit) {
  return new Set(git('ls-tree', '-r', '--name-only', commit).split('\n').filter(Boolean));
}

function listTreeBlobs(commit) {
  return new Set(
    git('ls-tree', '-r', commit)
      .split('\n')
      .filter(Boolean)
      .map((entry) => entry.split(/\s+/)[2]),
  );
}

function blobAt(commit, file) {
  return git('rev-parse', `${commit}:${file}`);
}

function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, file)))
    .digest('hex');
}

function gitBlob(file) {
  const content = fs.readFileSync(path.join(root, file));
  return crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildManifest() {
  const resolutions = Object.entries(mappings)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([legacyPath, mapping]) => ({
      legacy_path: legacyPath,
      upstream_v01_blob_oid: blobAt(snapshots.upstream_v01.commit, legacyPath),
      legacy_final_blob_oid: blobAt(snapshots.legacy_final.commit, legacyPath),
      disposition: mapping.disposition,
      mit_sources: mapping.mit_sources.map((source) => ({
        path: source,
        blob_oid: blobAt(snapshots.mit_baseline.import_commit, source),
      })),
      outputs: mapping.outputs.map((output) => ({ path: output, sha256: sha256(output) })),
    }));

  return {
    schema_version: 1,
    story: 'S0-014',
    scope: 'technical_provenance_evidence_not_legal_opinion',
    methodology:
      'Intersection of paths present in upstream v0.1 and legacy-final, absent from the imported MIT v0.3 tree; every result is then mapped, rewritten from the MIT baseline, or removed as obsolete.',
    source_snapshots: snapshots,
    majorant_count: resolutions.length,
    agpl_only_heritage: [],
    resolutions,
  };
}

function verifySnapshots() {
  assert(
    git('rev-parse', snapshots.upstream_v01.commit) === snapshots.upstream_v01.commit,
    'v0.1 commit mismatch',
  );
  assert(
    git('rev-parse', `${snapshots.upstream_v01.commit}^{tree}`) === snapshots.upstream_v01.tree,
    'v0.1 tree mismatch',
  );
  assert(
    git('rev-parse', snapshots.legacy_final.commit) === snapshots.legacy_final.commit,
    'legacy commit mismatch',
  );
  assert(
    git('rev-parse', `${snapshots.legacy_final.commit}^{tree}`) === snapshots.legacy_final.tree,
    'legacy tree mismatch',
  );
  assert(
    git('rev-parse', snapshots.mit_baseline.import_commit) === snapshots.mit_baseline.import_commit,
    'MIT import mismatch',
  );
  assert(
    git('rev-parse', `${snapshots.mit_baseline.import_commit}^{tree}`) ===
      snapshots.mit_baseline.import_tree,
    'MIT tree mismatch',
  );
  assert(
    blobAt(snapshots.upstream_v01.commit, 'LICENSE') === snapshots.upstream_v01.license_blob_oid,
    'v0.1 license blob mismatch',
  );
  assert(
    blobAt(snapshots.legacy_final.commit, 'LICENSE') === snapshots.legacy_final.license_blob_oid,
    'legacy license blob mismatch',
  );
  assert(
    blobAt(snapshots.mit_baseline.import_commit, 'LICENSE') ===
      snapshots.mit_baseline.license_blob_oid,
    'MIT license blob mismatch',
  );
}

function verifyMajorant(expectedPaths) {
  const upstream = listTree(snapshots.upstream_v01.commit);
  const legacy = listTree(snapshots.legacy_final.commit);
  const mit = listTree(snapshots.mit_baseline.import_commit);
  const derived = [...upstream].filter((file) => legacy.has(file) && !mit.has(file)).sort();
  assert(
    JSON.stringify(derived) === JSON.stringify(expectedPaths),
    'The reproducible majorant is not the declared 35-path set',
  );
}

function verifyWorkingTree(expectedPaths) {
  for (const legacyPath of expectedPaths) {
    assert(!fs.existsSync(path.join(root, legacyPath)), `Legacy path still exists: ${legacyPath}`);
  }

  const mitBlobs = listTreeBlobs(snapshots.mit_baseline.import_commit);
  const forbiddenBlobs = new Set(
    expectedPaths
      .map((file) => blobAt(snapshots.upstream_v01.commit, file))
      .filter((blob) => !mitBlobs.has(blob)),
  );
  const candidates = git('ls-files', '--cached', '--others', '--exclude-standard')
    .split('\n')
    .filter((file) => file && fs.existsSync(path.join(root, file)));
  for (const file of candidates) {
    assert(!forbiddenBlobs.has(gitBlob(file)), `A forbidden v0.1 blob survives at ${file}`);
  }
}

function verifyNotice() {
  const notice = fs.readFileSync(path.join(root, 'THIRD-PARTY-NOTICES'), 'utf8');
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').trim();
  const match = notice.match(
    /----- BEGIN OPENMAIC LICENSE -----\r?\n([\s\S]*?)\r?\n----- END OPENMAIC LICENSE -----/,
  );
  assert(match?.[1].trim() === license, 'The pinned MIT notice does not exactly match LICENSE');
}

verifySnapshots();
const expectedPaths = Object.keys(mappings).sort();
assert(expectedPaths.length === 35, `Expected 35 mappings, got ${expectedPaths.length}`);
verifyMajorant(expectedPaths);
verifyWorkingTree(expectedPaths);
verifyNotice();

const generated = buildManifest();
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
} else {
  assert(fs.existsSync(manifestPath), 'refork/audit-provenance.json is missing');
  const committed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(committed.agpl_only_heritage.length === 0, 'agpl_only_heritage must be empty');
  assert(committed.resolutions.length === 35, 'The manifest must contain 35 resolutions');
  assert(
    JSON.stringify(committed) === JSON.stringify(generated),
    'The provenance manifest is stale',
  );
}

process.stdout.write('S0-014 provenance check passed: 35/35 paths resolved, 0 residual.\n');
