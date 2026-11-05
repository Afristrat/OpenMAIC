import { openSecret, sealSecret } from '@/lib/server/secret-box';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export function validateLrsEndpoint(value: string): string {
  const endpoint = new URL(value);
  const local = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
  if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) {
    throw new Error('LRS endpoint must use HTTPS');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString().replace(/\/$/, '');
}

/** Endpoint LRS refusé par la garde SSRF (réseau privé, métadonnées cloud, hôte non résoluble…). */
export class LrsEndpointBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LrsEndpointBlockedError';
  }
}

export async function saveOrganizationLrsConfig(input: {
  orgId: string;
  endpoint: string;
  auth: string;
  enabled: boolean;
}): Promise<void> {
  if (!input.auth.trim() || input.auth.length > 4096) throw new Error('Invalid LRS authorization');
  const endpoint = validateLrsEndpoint(input.endpoint);
  // Refus à l'enregistrement ; l'envoi (safeFetch) revalide et épingle la connexion à chaque livraison.
  const ssrfError = await validateUrlForSSRF(endpoint);
  if (ssrfError) throw new LrsEndpointBlockedError(ssrfError);
  const sealed = sealSecret(input.auth);
  const service = createServiceSupabaseClient();
  const { error } = await service.from('organization_lrs_configs').upsert({
    org_id: input.orgId,
    endpoint,
    auth_ciphertext: sealed.ciphertext,
    auth_iv: sealed.iv,
    auth_tag: sealed.tag,
    enabled: input.enabled,
  });
  if (error) throw new Error(`LRS configuration save failed: ${error.message}`);
}

export async function readOrganizationLrsConfig(orgId: string): Promise<{
  endpoint: string;
  auth: string;
  enabled: boolean;
} | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from('organization_lrs_configs')
    .select('endpoint, auth_ciphertext, auth_iv, auth_tag, enabled')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`LRS configuration lookup failed: ${error.message}`);
  if (!data) return null;
  const auth = openSecret({
    ciphertext: data.auth_ciphertext,
    iv: data.auth_iv,
    tag: data.auth_tag,
  });
  return { endpoint: data.endpoint, auth, enabled: data.enabled };
}
