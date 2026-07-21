import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const publisher = resolve(repositoryRoot, 'scripts/publish-formation-engine.mjs');
const temporaryRoots: string[] = [];

type ApprovalStatus = 'approved' | 'pending';

function write(root: string, path: string, content: string) {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function git(root: string, args: string[]) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function makeCanonicalSource(status: ApprovalStatus = 'approved') {
  const root = mkdtempSync(join(tmpdir(), 'qalem-private-engine-'));
  temporaryRoots.push(root);
  write(root, 'shared/core.md', '# Moteur partagé\n');
  write(root, 'standalone/SKILL.md', '# Skill autonome\n');
  write(root, 'qalem/adapter.json', '{"adapter":"qalem"}\n');
  write(
    root,
    'publication-plan.json',
    `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: 'synthetic-private-engine',
        targets: {
          standalone: {
            redistributionApproval: { status, reference: 'approval:test:standalone' },
            files: [
              { source: 'shared/core.md', path: 'references/core.md' },
              { source: 'standalone/SKILL.md', path: 'SKILL.md' },
            ],
          },
          qalem: {
            redistributionApproval: { status: 'approved', reference: 'approval:test:qalem' },
            files: [
              { source: 'shared/core.md', path: 'references/core.md' },
              { source: 'qalem/adapter.json', path: 'adapter.json' },
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'tests@qalem.ma']);
  git(root, ['config', 'user.name', 'Qalem tests']);
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', 'canonical source']);
  return { root, revision: git(root, ['rev-parse', 'HEAD']) };
}

function runPublisher(source: string, output: string) {
  return execFileSync(process.execPath, [publisher, '--source', source, '--output', output], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function snapshot(root: string): Array<[string, string]> {
  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = join(directory, entry.name);
      return entry.isDirectory() ? walk(absolute) : [absolute];
    });
  }
  return walk(root)
    .map(
      (path) =>
        [
          relative(root, path).replaceAll('\\', '/'),
          createHash('sha256').update(readFileSync(path)).digest('hex'),
        ] as [string, string],
    )
    .sort(([left], [right]) => left.localeCompare(right));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('formation engine double publication', () => {
  it('produces byte-identical targets from the same clean Git revision', () => {
    const source = makeCanonicalSource();
    const outputA = mkdtempSync(join(tmpdir(), 'qalem-publication-a-'));
    const outputB = mkdtempSync(join(tmpdir(), 'qalem-publication-b-'));
    temporaryRoots.push(outputA, outputB);

    expect(runPublisher(source.root, outputA)).toContain(source.revision);
    expect(runPublisher(source.root, outputB)).toContain(source.revision);
    expect(snapshot(outputA)).toEqual(snapshot(outputB));

    const standalone = JSON.parse(
      readFileSync(join(outputA, 'standalone/publication.json'), 'utf8'),
    );
    const qalem = JSON.parse(readFileSync(join(outputA, 'qalem/publication.json'), 'utf8'));
    expect(standalone.provenance.sourceRevision).toBe(source.revision);
    expect(qalem.provenance.sourceRevision).toBe(source.revision);
    expect(standalone.provenance.planSha256).toBe(qalem.provenance.planSha256);
    expect(standalone.files.map((file: { path: string }) => file.path)).toEqual([
      'references/core.md',
      'SKILL.md',
    ]);
    expect(qalem.files.map((file: { path: string }) => file.path)).toEqual([
      'adapter.json',
      'references/core.md',
    ]);
  });

  it('refuses a dirty canonical source before creating output', () => {
    const source = makeCanonicalSource();
    const output = join(tmpdir(), `qalem-publication-dirty-${Date.now()}`);
    temporaryRoots.push(output);
    appendFileSync(join(source.root, 'shared/core.md'), 'mutation\n', 'utf8');

    expect(() => runPublisher(source.root, output)).toThrow(/worktree is dirty/u);
    expect(() => readdirSync(output)).toThrow();
  });

  it('refuses a target without explicit redistribution approval', () => {
    const source = makeCanonicalSource('pending');
    const output = join(tmpdir(), `qalem-publication-pending-${Date.now()}`);
    temporaryRoots.push(output);

    expect(() => runPublisher(source.root, output)).toThrow(/redistribution is not approved/u);
    expect(() => readdirSync(output)).toThrow();
  });
});
