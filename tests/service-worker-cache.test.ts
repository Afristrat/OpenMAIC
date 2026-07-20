import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA shell cache', () => {
  it('refreshes the restored marketing root instead of retaining the former studio shell', () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
    const registrar = readFileSync(
      resolve(process.cwd(), 'components/service-worker-registrar.tsx'),
      'utf8',
    );
    const rootLayout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');

    expect(serviceWorker).toContain("const APP_SHELL_CACHE = 'qalem-shell-v2'");
    expect(serviceWorker).toContain("cache: 'no-store'");
    expect(registrar).toContain("updateViaCache: 'none'");
    expect(registrar).toContain('registration.update()');
    expect(rootLayout).toContain('<ServiceWorkerRegistrar />');
  });
});
