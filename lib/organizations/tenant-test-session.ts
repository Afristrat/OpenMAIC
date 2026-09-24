export const CURRENT_ORGANIZATION_STORAGE_KEY = 'qalem-current-org-id';
export const TENANT_TEST_SESSION_KEY = 'qalem-super-admin-tested-tenant-id';
export const TENANT_TEST_SESSION_EVENT = 'qalem:tenant-test-session-changed';

function notifyTenantTestSessionChanged(): void {
  window.dispatchEvent(new Event(TENANT_TEST_SESSION_EVENT));
}

export function readTestedTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(TENANT_TEST_SESSION_KEY);
  } catch {
    return null;
  }
}

export function recoverLegacyTenantTest(): string | null {
  if (typeof window === 'undefined') return null;
  const testedTenantId = readTestedTenantId();
  if (testedTenantId) return testedTenantId;

  try {
    const activeTenantId = localStorage.getItem(CURRENT_ORGANIZATION_STORAGE_KEY);
    if (!activeTenantId) return null;
    sessionStorage.setItem(TENANT_TEST_SESSION_KEY, activeTenantId);
    return activeTenantId;
  } catch {
    return null;
  }
}

export function beginTenantTest(organizationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TENANT_TEST_SESSION_KEY, organizationId);
  } catch {
    // Session storage can be disabled independently from local storage.
  }
  try {
    localStorage.setItem(CURRENT_ORGANIZATION_STORAGE_KEY, organizationId);
  } finally {
    notifyTenantTestSessionChanged();
  }
}

export function endTenantTest(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TENANT_TEST_SESSION_KEY);
  } catch {
    // Session storage can be disabled independently from local storage.
  }
  try {
    localStorage.removeItem(CURRENT_ORGANIZATION_STORAGE_KEY);
  } finally {
    notifyTenantTestSessionChanged();
  }
}
