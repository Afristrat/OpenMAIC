import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Qalem runtime environment contract', () => {
  it('passes the dedicated image and LRS keys into background workers', () => {
    const compose = readFileSync(resolve('infra/coolify/qalem-runtime.yml'), 'utf8');

    expect(compose).toContain('IMAGE_OPENAI_API_KEY: ${IMAGE_OPENAI_API_KEY}');
    expect(compose).toContain(
      'LRS_CONFIG_ENCRYPTION_KEY: ${LRS_CONFIG_ENCRYPTION_KEY:?LRS configuration encryption key required}',
    );
  });
});
