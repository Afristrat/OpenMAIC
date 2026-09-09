'use client';

import { createContext, useContext } from 'react';
import { getCurrentOrganizationId } from '@/lib/hooks/use-organizations';

// undefined preserves standalone editor behavior; null explicitly denies a tenant.
export const ClassroomOrganizationContext = createContext<string | null | undefined>(undefined);
export function useClassroomOrganizationId(): string | null {
  const organizationId = useContext(ClassroomOrganizationContext);
  return organizationId === undefined ? getCurrentOrganizationId() : organizationId;
}
