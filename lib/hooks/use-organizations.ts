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
  isMember: boolean;
  refresh: () => Promise<void>;
  createOrganization: (name: string, sector: string | null) => Promise<OrganizationWithRole>;
}

const CURRENT_ORG_KEY = 'qalem-current-org-id';

export function useOrganizations(): UseOrganizationsReturn {
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<OrganizationWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOrganizations = useCallback(async () => {
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

  /* eslint-disable react-hooks/set-state-in-effect -- Async hydration on mount */
  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const isMember = currentOrg !== null;

  return {
    organizations,
    currentOrg,
    setCurrentOrg,
    isLoading,
    isAdmin,
    isMember,
    refresh: fetchOrganizations,
    createOrganization,
  };
}
