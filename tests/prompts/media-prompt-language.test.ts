import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (relative: string): string =>
  readFileSync(join(process.cwd(), 'lib', 'prompts', relative), 'utf8');

describe('language of the prompts written by the platform', () => {
  test.each(['snippets/image-instructions.md', 'snippets/video-instructions.md'])(
    '%s requires the media prompt in the course language',
    (file) => {
      expect(read(file)).toContain('Language of the prompt (MANDATORY)');
    },
  );

  test('the resource prompt is written in the course language and its example is not English', () => {
    const outlines = read('templates/requirements-to-outlines/system.md');
    expect(outlines).toContain('Write `prompt` entirely in the course language');
    expect(outlines).not.toContain('Create a rolling 13-week');
  });
});
