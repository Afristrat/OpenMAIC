import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { loadSkillFromDir } from '@/lib/skills/loader';

const skillRoot = resolve(process.cwd(), 'skills/formation-design-pro');
const expectedVectors = ['V-02', 'V-03', 'V-04', 'V-05', 'V-07'];

describe('formation engine platform publication', () => {
  it('hydrates the traced refactored engine override through the production loader', () => {
    const skill = loadSkillFromDir(skillRoot);

    expect(skill?.version).toBe('3.2.0');
    expect(skill?.traceability).toEqual({
      source: 'external-private-git publication with Qalem animation contract',
      vectors: expectedVectors,
      validatedAt: '2026-08-05',
      publicationManifest: 'publication.json',
    });
    expect(skill?.promptOverrides).toHaveLength(5);
    expect(skill?.designEngine).toEqual({
      approachSelection: 'author-required',
      animationContract: 'references/formation-design-contract.md',
    });
    for (const override of skill?.promptOverrides ?? []) {
      expect(override.systemPromptAppend).toContain('Formation Engine');
      expect(override.systemPromptAppend).not.toMatch(/^file:/u);
    }
  });

  it('records source, vectors, date and exact hashes for every knowledge file', () => {
    const publication = JSON.parse(
      readFileSync(resolve(skillRoot, 'publication.json'), 'utf8'),
    ) as {
      provenance: {
        validatedVectors: string[];
        lastValidatedStory: string;
        validatedAt: string;
      };
      files: Array<{ path: string; sha256: string }>;
    };
    const prompt = readFileSync(resolve(skillRoot, 'prompts/andragogy-system-override.md'), 'utf8');

    expect(publication.provenance).toMatchObject({
      validatedVectors: expectedVectors,
      lastValidatedStory: 'S4-008',
      validatedAt: '2026-08-05',
    });
    expect(prompt).toContain('source: external-private-git publication');
    expect(prompt).toContain(`vectors: ${expectedVectors.join(', ')}`);
    expect(prompt).toContain('validated-at: 2026-07-22');

    for (const file of publication.files) {
      const actual = createHash('sha256')
        .update(readFileSync(resolve(skillRoot, file.path)))
        .digest('hex');
      expect(actual).toBe(file.sha256);
    }
  });
});
