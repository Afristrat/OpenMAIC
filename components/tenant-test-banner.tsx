'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useIsSuperAdmin } from '@/lib/hooks/use-super-admin';
import {
  beginTenantTest,
  clearTenantTestSession,
  endTenantTest,
  readTestedTenantId,
  TENANT_TEST_SESSION_EVENT,
} from '@/lib/organizations/tenant-test-session';

export function TenantTestBanner(): React.ReactElement | null {
  const { t } = useI18n();
  const pathname = usePathname();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { currentOrg, organizations } = useOrganizations();
  const [testedTenantId, setTestedTenantId] = useState<string | null>(null);

  useEffect(() => {
    const synchronize = () => setTestedTenantId(readTestedTenantId());
    const requestedTenantId =
      pathname === '/app' ? new URLSearchParams(window.location.search).get('orgId') : null;
    const requestedOrganization = requestedTenantId
      ? organizations.find((organization) => organization.id === requestedTenantId)
      : undefined;
    if (requestedOrganization && isSuperAdmin) {
      if (requestedOrganization.isDirectMember) clearTenantTestSession();
      else beginTenantTest(requestedOrganization.id);
    }
    synchronize();
    window.addEventListener(TENANT_TEST_SESSION_EVENT, synchronize);
    return () => window.removeEventListener(TENANT_TEST_SESSION_EVENT, synchronize);
  }, [isSuperAdmin, organizations, pathname]);

  const leaveTenantTest = useCallback(() => {
    const originOrganizationId = endTenantTest();
    window.location.replace(
      originOrganizationId
        ? `/app?orgId=${encodeURIComponent(originOrganizationId)}`
        : '/admin?tab=tenants',
    );
  }, []);

  if (!isSuperAdmin || !testedTenantId) return null;

  const tenantName =
    organizations.find((organization) => organization.id === testedTenantId)?.name ??
    (currentOrg?.id === testedTenantId ? currentOrg.name : testedTenantId);

  return (
    <aside
      role="status"
      className="fixed inset-x-3 top-3 z-[300] mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-3 rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm text-violet-950 shadow-lg dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
    >
      <span>{t('admin.tenantTest.banner', { tenant: tenantName })}</span>
      <button
        type="button"
        onClick={leaveTenantTest}
        className="rounded-md bg-violet-700 px-3 py-1.5 font-semibold text-white hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        {t('admin.tenantTest.return')}
      </button>
    </aside>
  );
}
