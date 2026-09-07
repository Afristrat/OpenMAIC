import type { Tool } from 'ai';
import { getActiveTenantId } from '@/lib/billing/usage-context';
import { getExternalTools, initMCPClients } from './client';
import { loadMCPServerConfigs } from './config';

let initialization: Promise<void> | undefined;

/** Lazy initialization avoids outbound connections during build/static rendering. */
export async function getRequestMCPTools(): Promise<Record<string, Tool>> {
  const tenantId = getActiveTenantId();
  if (!tenantId) return {};
  initialization ??= initMCPClients(loadMCPServerConfigs()).catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return getExternalTools(tenantId);
}
