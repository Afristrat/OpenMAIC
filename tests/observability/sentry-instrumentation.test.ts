import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Sentry instrumentation contract', () => {
  it('registers Node, Edge and nested request errors through Next.js instrumentation', () => {
    const instrumentation = source('instrumentation.ts');
    expect(instrumentation).toContain("import('./sentry.server.config')");
    expect(instrumentation).toContain("import('./sentry.edge.config')");
    expect(instrumentation).toContain('Sentry.captureRequestError');
  });

  it('uses the current client hook and captures App Router render failures', () => {
    expect(existsSync(resolve(root, 'sentry.client.config.ts'))).toBe(false);
    expect(source('instrumentation-client.ts')).toContain('Sentry.captureRouterTransitionStart');
    expect(source('app/global-error.tsx')).toContain('Sentry.captureException(error)');
  });
});
