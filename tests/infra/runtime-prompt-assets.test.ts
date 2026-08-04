import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('production prompt assets', () => {
  it('includes markdown prompts in the Docker build context and standalone runner', () => {
    const dockerignore = readFileSync(resolve('.dockerignore'), 'utf8');
    const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');

    expect(dockerignore).toContain('!lib/prompts/**/*.md');
    expect(dockerfile).toMatch(
      /COPY --from=builder --chown=nextjs:nodejs \/app\/lib\/prompts \.\/lib\/prompts/,
    );
  });
});
