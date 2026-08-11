import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function expectPng(path: string) {
  const bytes = readFileSync(path);

  expect(bytes.length).toBeGreaterThan(0);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

describe('PBL v2 static assets', () => {
  test('ships the instructor avatar referenced by the runtime UI', () => {
    expectPng('public/avatars/instructor.png');
  });

  test('packages the runtime PBL prompts in the standalone web image', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    expect(dockerfile).toContain(
      'COPY --from=builder --chown=nextjs:nodejs /app/lib/pbl/v2/prompts ./lib/pbl/v2/prompts',
    );
  });
});
