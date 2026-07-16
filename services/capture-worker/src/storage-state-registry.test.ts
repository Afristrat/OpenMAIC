import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveStorageStatePath } from './storage-state-registry.js';

describe('resolveStorageStatePath', () => {
  let dir: string;
  const originalDir = process.env.CAPTURE_STORAGE_STATE_DIR;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'storage-state-'));
    process.env.CAPTURE_STORAGE_STATE_DIR = dir;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalDir === undefined) delete process.env.CAPTURE_STORAGE_STATE_DIR;
    else process.env.CAPTURE_STORAGE_STATE_DIR = originalDir;
  });

  it('resolves a registered hostname to its dash-named file, no code change needed', () => {
    writeFileSync(path.join(dir, 'example-com.json'), '{}');
    const result = resolveStorageStatePath('https://example.com/page');
    expect(result).toBe(path.join(dir, 'example-com.json'));
  });

  it('resolves multi-label hostnames the same way', () => {
    writeFileSync(path.join(dir, 'proxy-ai-mpower-com.json'), '{}');
    const result = resolveStorageStatePath('https://proxy.ai-mpower.com/ui');
    expect(result).toBe(path.join(dir, 'proxy-ai-mpower-com.json'));
  });

  it('returns undefined when no storage state file exists for the hostname', () => {
    const result = resolveStorageStatePath('https://never-registered.example/page');
    expect(result).toBeUndefined();
  });
});
