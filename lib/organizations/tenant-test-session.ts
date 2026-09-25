export const CURRENT_ORGANIZATION_STORAGE_KEY = 'qalem-current-org-id';
export const TENANT_TEST_SESSION_KEY = 'qalem-super-admin-tested-tenant-id';
export const TENANT_TEST_ORIGIN_KEY = 'qalem-super-admin-origin-org-id';
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

export function beginTenantTest(organizationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const currentOrganizationId = localStorage.getItem(CURRENT_ORGANIZATION_STORAGE_KEY);
    if (currentOrganizationId && currentOrganizationId !== organizationId) {
      sessionStorage.setItem(TENANT_TEST_ORIGIN_KEY, currentOrganizationId);
    }
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

export function endTenantTest(): string | null {
  if (typeof window === 'undefined') return null;
  let testedTenantId: string | null = null;
  let originOrganizationId: string | null = null;
  try {
    testedTenantId = sessionStorage.getItem(TENANT_TEST_SESSION_KEY);
    originOrganizationId = sessionStorage.getItem(TENANT_TEST_ORIGIN_KEY);
    sessionStorage.removeItem(TENANT_TEST_SESSION_KEY);
    sessionStorage.removeItem(TENANT_TEST_ORIGIN_KEY);
  } catch {
    // Session storage can be disabled independently from local storage.
  }
  try {
    if (testedTenantId) {
      if (originOrganizationId) {
        localStorage.setItem(CURRENT_ORGANIZATION_STORAGE_KEY, originOrganizationId);
      } else {
        localStorage.removeItem(CURRENT_ORGANIZATION_STORAGE_KEY);
      }
    }
  } finally {
    notifyTenantTestSessionChanged();
  }
  return originOrganizationId;
}

export function clearTenantTestSession(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TENANT_TEST_SESSION_KEY);
    sessionStorage.removeItem(TENANT_TEST_ORIGIN_KEY);
  } finally {
    notifyTenantTestSessionChanged();
  }
}
