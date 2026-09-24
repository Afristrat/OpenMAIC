'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { useIsSuperAdmin } from '@/lib/hooks/use-super-admin';
import {
  beginTenantTest,
  endTenantTest,
  readTestedTenantId,
  recoverLegacyTenantTest,
  TENANT_TEST_SESSION_EVENT,
} from '@/lib/organizations/tenant-test-session';

export function TenantTestBanner(): React.ReactElement | null {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { currentOrg, organizations } = useOrganizations();
  const [testedTenantId, setTestedTenantId] = useState<string | null>(null);

  useEffect(() => {
    const synchronize = () => setTestedTenantId(readTestedTenantId());
    const requestedTenantId =
      pathname === '/app' ? new URLSearchParams(window.location.search).get('orgId') : null;
    if (requestedTenantId && isSuperAdmin) beginTenantTest(requestedTenantId);
    if (isSuperAdmin && pathname !== '/admin') recoverLegacyTenantTest();
    synchronize();
    window.addEventListener(TENANT_TEST_SESSION_EVENT, synchronize);
    return () => window.removeEventListener(TENANT_TEST_SESSION_EVENT, synchronize);
  }, [isSuperAdmin, pathname]);

  const leaveTenantTest = useCallback(() => {
    endTenantTest();
    router.replace('/admin?tab=tenants');
    router.refresh();
  }, [router]);

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
