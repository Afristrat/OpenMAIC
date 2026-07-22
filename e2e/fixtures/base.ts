import { test as base } from '@playwright/test';
import { MockApi } from './mock-api';

type Fixtures = {
  mockApi: MockApi;
};

export const test = base.extend<Fixtures>({
  mockApi: async ({ page }, use) => {
    const mockApi = new MockApi(page);
    // Always mock server-providers — called on every page load by root layout
    await mockApi.mockServerProviders();
    await page.route('**/api/account/is-admin', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"isAdmin":false}' }),
    );
    // Classroom editor scenarios seed IndexedDB rather than a Supabase test
    // project. Intercept their debounced server autosave so a successful UI
    // flow cannot hide connection errors to the deliberately fake E2E URL.
    await page.route('**/api/classroom**', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.fallback();
        return;
      }

      const body = route.request().postDataJSON() as { stage?: { id?: unknown } };
      const id = typeof body.stage?.id === 'string' ? body.stage.id : 'e2e-classroom';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id } }),
      });
    });
    await use(mockApi);
  },
});

export { expect } from '@playwright/test';
