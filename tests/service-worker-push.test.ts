import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type ServiceWorkerListener = (event: {
  data?: { json: () => unknown };
  notification?: { close: () => void; data?: { url?: string } };
  waitUntil: (promise: Promise<unknown>) => void;
}) => void;

function loadServiceWorker(clients: unknown[] = []) {
  const listeners = new Map<string, ServiceWorkerListener>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { origin: 'https://qalem.ma' },
    registration: { showNotification },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue(clients),
      openWindow,
    },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: ServiceWorkerListener) => {
      listeners.set(type, listener);
    },
  };

  runInNewContext(readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'), {
    self,
    caches: {},
    fetch: vi.fn(),
    URL,
    Request,
    Response,
  });
  return { listeners, openWindow, showNotification };
}

describe('Web Push service worker', () => {
  it('shows the server payload and rejects a cross-origin notification target', async () => {
    const { listeners, showNotification } = loadServiceWorker();
    let pending: Promise<unknown> = Promise.resolve();

    listeners.get('push')?.({
      data: {
        json: () => ({ title: 'Qalem', body: 'Test', targetUrl: '//attacker.example' }),
      },
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;

    expect(showNotification).toHaveBeenCalledWith(
      'Qalem',
      expect.objectContaining({ body: 'Test', data: { url: '/review' } }),
    );
  });

  it('navigates an existing PWA window to the exact targeted card', async () => {
    const client = {
      url: 'https://qalem.ma/settings',
      navigate: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
    };
    const { listeners, openWindow } = loadServiceWorker([client]);
    let pending: Promise<unknown> = Promise.resolve();

    listeners.get('notificationclick')?.({
      notification: {
        close: vi.fn(),
        data: { url: '/review?card=11111111-1111-4111-8111-111111111111' },
      },
      waitUntil: (promise) => {
        pending = promise;
      },
    });
    await pending;

    expect(client.navigate).toHaveBeenCalledWith(
      'https://qalem.ma/review?card=11111111-1111-4111-8111-111111111111',
    );
    expect(client.focus).toHaveBeenCalledOnce();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
