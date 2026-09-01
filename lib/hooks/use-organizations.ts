'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Organization, OrgMemberRole } from '@/lib/supabase/types';

interface OrganizationWithRole extends Organization {
  userRole: OrgMemberRole;
}

interface UseOrganizationsReturn {
  organizations: OrganizationWithRole[];
  currentOrg: OrganizationWithRole | null;
  setCurrentOrg: (org: OrganizationWithRole | null) => void;
  isLoading: boolean;
  isAdmin: boolean;
  canAuthor: boolean;
  isMember: boolean;
  refresh: () => Promise<void>;
  createOrganization: (name: string, sector: string | null) => Promise<OrganizationWithRole>;
}

const CURRENT_ORG_KEY = 'qalem-current-org-id';
const E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
const E2E_ORGANIZATION: OrganizationWithRole = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Qalem E2E',
  sector: 'education',
  logo: null,
  default_locale: 'fr-FR',
  settings: {},
  status: 'active',
  seat_limit: 100,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  userRole: 'admin',
};

export function useOrganizations(): UseOrganizationsReturn {
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>(
    E2E_TEST_MODE ? [E2E_ORGANIZATION] : [],
  );
  const [currentOrg, setCurrentOrgState] = useState<OrganizationWithRole | null>(
    E2E_TEST_MODE ? E2E_ORGANIZATION : null,
  );
  const [isLoading, setIsLoading] = useState(!E2E_TEST_MODE);

  const fetchOrganizations = useCallback(async () => {
    if (E2E_TEST_MODE) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/organizations');
      if (!res.ok) {
        setOrganizations([]);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      const orgs: OrganizationWithRole[] = data.organizations ?? [];
      setOrganizations(orgs);

      // Restore current org from localStorage
      try {
        const savedOrgId = localStorage.getItem(CURRENT_ORG_KEY);
        if (savedOrgId) {
          const found = orgs.find((o) => o.id === savedOrgId);
          if (found) {
            setCurrentOrgState(found);
          } else if (orgs.length > 0) {
            setCurrentOrgState(orgs[0]);
          }
        } else if (orgs.length > 0) {
          setCurrentOrgState(orgs[0]);
        }
      } catch {
        if (orgs.length > 0) {
          setCurrentOrgState(orgs[0]);
        }
      }
    } catch {
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const setCurrentOrg = useCallback((org: OrganizationWithRole | null) => {
    setCurrentOrgState(org);
    try {
      if (org) {
        localStorage.setItem(CURRENT_ORG_KEY, org.id);
      } else {
        localStorage.removeItem(CURRENT_ORG_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const createOrganization = useCallback(
    async (name: string, sector: string | null): Promise<OrganizationWithRole> => {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sector }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error ?? 'Failed to create organization');
      }

      const data = await res.json();
      const newOrg: OrganizationWithRole = data.organization;

      // Refresh the full list so sidebar updates immediately
      await fetchOrganizations();

      return newOrg;
    },
    [fetchOrganizations],
  );

  const isAdmin = currentOrg?.userRole === 'admin';
  const canAuthor =
    currentOrg != null && ['admin', 'manager', 'author'].includes(currentOrg.userRole);
  const isMember = currentOrg !== null;

  return {
    organizations,
    currentOrg,
    setCurrentOrg,
    isLoading,
    isAdmin,
    canAuthor,
    isMember,
    refresh: fetchOrganizations,
    createOrganization,
  };
}
