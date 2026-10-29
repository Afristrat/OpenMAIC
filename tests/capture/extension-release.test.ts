import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_RELEASE } from '@/lib/capture/extension-release';
import { MIN_EXTENSION_VERSION } from '@/lib/capture/bridge-protocol';

const archive = readFileSync(
  path.join(process.cwd(), 'public', 'downloads', EXTENSION_RELEASE.file),
);

describe('archive de l’extension servie par le site', () => {
  it('a la taille et l’empreinte annoncées sur la page', () => {
    expect(archive.length).toBe(EXTENSION_RELEASE.sizeBytes);
    expect(createHash('sha256').update(archive).digest('hex')).toBe(EXTENSION_RELEASE.sha256);
  });

  it('est une archive ZIP', () => {
    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  it('porte la version minimale exigée par le pont de la page', () => {
    expect(EXTENSION_RELEASE.version).toBe(MIN_EXTENSION_VERSION);
    expect(EXTENSION_RELEASE.file).toContain(EXTENSION_RELEASE.version);
  });
});
