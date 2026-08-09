import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Qalem runtime image generation configuration', () => {
  it('passes the dedicated image key into background workers', () => {
    const compose = readFileSync(resolve('infra/coolify/qalem-runtime.yml'), 'utf8');

    expect(compose).toContain('IMAGE_OPENAI_API_KEY: ${IMAGE_OPENAI_API_KEY}');
  });
});
