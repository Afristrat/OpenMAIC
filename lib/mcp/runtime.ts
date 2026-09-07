import type { Tool } from 'ai';
import { getActiveTenantId } from '@/lib/billing/usage-context';
import { checkMCPHealth, getExternalTools, initMCPClients } from './client';
import { loadMCPServerConfigs } from './config';

let initialization: Promise<void> | undefined;

/** Lazy initialization avoids outbound connections during build/static rendering. */
async function ensureInitialized(): Promise<void> {
  initialization ??= initMCPClients(loadMCPServerConfigs()).catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
}

/** Server-only, called after the administration route has authorized its caller. */
export async function getMCPHealth() {
  await ensureInitialized();
  return checkMCPHealth();
}

export async function getRequestMCPTools(): Promise<Record<string, Tool>> {
  const tenantId = getActiveTenantId();
  if (!tenantId) return {};
  await ensureInitialized();
  return getExternalTools(tenantId);
}
