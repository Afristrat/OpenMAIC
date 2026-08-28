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

    expect(serviceWorker).toContain("const APP_SHELL_CACHE = 'qalem-shell-v3'");
    expect(serviceWorker).toContain("const STATIC_CACHE = 'qalem-static-v3'");
    expect(serviceWorker).not.toContain('DATA_CACHE');
    expect(serviceWorker).toContain('networkOnlyWithOfflineResponse(event.request)');
    expect(serviceWorker).not.toContain('networkFirst(');
    expect(serviceWorker).toContain("credentials: 'omit'");
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("addEventListener('push'");
    expect(serviceWorker).toContain('safeNotificationTarget(payload.targetUrl)');
    expect(serviceWorker).toContain("icon: '/icon-192.png'");
    expect(serviceWorker).toContain('client.navigate(absoluteTarget)');
    expect(serviceWorker).toContain("cache: 'no-store'");
    expect(serviceWorker).toContain('Hors connexion — reconnectez-vous pour continuer.');
    expect(serviceWorker).toContain('text/html; charset=utf-8');
    expect(registrar).toContain("updateViaCache: 'none'");
    expect(registrar).toContain('registration.update()');
    expect(registrar).toContain(
      "const E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'",
    );
    expect(registrar).toContain("if (E2E_TEST_MODE || typeof window === 'undefined'");
    expect(rootLayout).toContain('<ServiceWorkerRegistrar />');
  });
});
