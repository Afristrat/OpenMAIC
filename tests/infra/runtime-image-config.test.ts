import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

describe('Qalem runtime environment contract', () => {
  it('passes the dedicated image and LRS keys into background workers', () => {
    const compose = readFileSync(resolve('infra/coolify/qalem-runtime.yml'), 'utf8');

    expect(compose).toContain('IMAGE_OPENAI_API_KEY: ${IMAGE_OPENAI_API_KEY}');
    expect(compose).toContain('IMAGE_DGX_API_KEY: ${IMAGE_DGX_API_KEY}');
    expect(compose).toContain('IMAGE_DGX_BASE_URL: ${IMAGE_DGX_BASE_URL}');
    expect(compose).toContain('IMAGE_DGX_MODELS: ${IMAGE_DGX_MODELS}');
    expect(compose).toContain('LRS_CONFIG_ENCRYPTION_KEY: ${LRS_CONFIG_ENCRYPTION_KEY:-}');
  });
});

type ComposeService = {
  environment?: Record<string, string>;
  entrypoint?: string[];
  command?: string[];
};

/** Variables an isolated service may inherit from its image or the container runtime. */
const RUNTIME_BASELINE = new Set([
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PYTHONDONTWRITEBYTECODE',
  'PYTHONUNBUFFERED',
  'NO_TORCH_COMPILE',
]);

describe('Qalem runtime secret isolation', () => {
  const compose = load(readFileSync(resolve('infra/coolify/qalem-runtime.yml'), 'utf8')) as {
    services: Record<string, ComposeService>;
  };

  for (const name of ['capture-worker', 'audioseal-sidecar']) {
    it(`starts ${name} with exactly the variables it declares`, () => {
      const service = compose.services[name];
      const script = service.entrypoint?.[2] ?? '';

      expect(service.entrypoint?.slice(0, 2)).toEqual(['/bin/sh', '-c']);
      expect(script).toMatch(/^exec env -i /);
      expect(script).toMatch(/"\$\$@"$/);
      expect(service.command?.length).toBeGreaterThan(0);

      const forwarded = [...script.matchAll(/(?:^|\s)([A-Z][A-Z0-9_]*)="\$\$([A-Z][A-Z0-9_]*)"/g)];
      for (const [, key, source] of forwarded) expect(source).toBe(key);
      const forwardedKeys = new Set(forwarded.map(([, key]) => key));

      const declared = Object.keys(service.environment ?? {});
      for (const key of declared) expect(forwardedKeys).toContain(key);
      for (const key of forwardedKeys) {
        expect(declared.includes(key) || RUNTIME_BASELINE.has(key)).toBe(true);
      }
    });
  }

  it('keeps the platform secrets out of the isolated services', () => {
    for (const name of ['capture-worker', 'audioseal-sidecar']) {
      const script = compose.services[name].entrypoint?.[2] ?? '';
      for (const secret of [
        'SUPABASE_SERVICE_ROLE_KEY',
        'LTI_PRIVATE_KEY',
        'LRS_CONFIG_ENCRYPTION_KEY',
        'OPENAI_API_KEY',
      ]) {
        expect(script).not.toContain(secret);
      }
    }
  });
});

describe('Qalem build-time secret exposure', () => {
  const compose = readFileSync(resolve('infra/coolify/qalem-runtime.yml'), 'utf8');

  // Coolify only feeds build-time variables to `docker compose build`. A `${VAR:?}` forces the
  // variable to be flagged is_buildtime, which injects the secret as a build argument.
  it.each([
    'LTI_APP_URL',
    'LTI_KEY_ID',
    'LTI_PRIVATE_KEY',
    'LTI_PUBLIC_KEY',
    'LRS_CONFIG_ENCRYPTION_KEY',
    'QALEM_AUDIOSEAL_TOKEN',
  ])('does not require %s at build time', (name) => {
    expect(compose).toContain(`${name}: \${${name}:-}`);
    expect(compose).not.toContain(`\${${name}:?`);
  });
});
