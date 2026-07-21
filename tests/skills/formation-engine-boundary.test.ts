import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('formation engine publication boundary', () => {
  it('rejects tracked private inputs and unrecorded public artifacts', () => {
    const output = execFileSync(process.execPath, ['scripts/check-formation-engine-boundary.mjs'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
    });

    expect(output).toContain('Formation engine boundary: OK');
  });
});
