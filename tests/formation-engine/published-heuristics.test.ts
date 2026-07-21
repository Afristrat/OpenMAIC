import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publishedFiles = [
  'skills/formation-design-pro/manifest.json',
  'skills/formation-design-pro/prompts/andragogy-system-override.md',
];

describe('Formation Design Pro published heuristics', () => {
  it.each(publishedFiles)('%s contains no universal fixed heuristic', (path) => {
    const content = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(content).not.toMatch(
      /\d+\s*%|(?:mandatory|obligatoire).*ratio|النسبة الإلزامية|3-4 concepts|15 minutes|30\/60\/90|\/40 points/iu,
    );
  });
});
