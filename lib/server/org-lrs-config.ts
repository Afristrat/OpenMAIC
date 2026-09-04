import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const encoded = process.env.LRS_CONFIG_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('LRS_CONFIG_ENCRYPTION_KEY is missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('LRS_CONFIG_ENCRYPTION_KEY must encode 32 bytes');
  return key;
}

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

export async function saveOrganizationLrsConfig(input: {
  orgId: string;
  endpoint: string;
  auth: string;
  enabled: boolean;
}): Promise<void> {
  if (!input.auth.trim() || input.auth.length > 4096) throw new Error('Invalid LRS authorization');
  const endpoint = validateLrsEndpoint(input.endpoint);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(input.auth, 'utf8'), cipher.final()]);
  const service = createServiceSupabaseClient();
  const { error } = await service.from('organization_lrs_configs').upsert({
    org_id: input.orgId,
    endpoint,
    auth_ciphertext: `\\x${ciphertext.toString('hex')}`,
    auth_iv: `\\x${iv.toString('hex')}`,
    auth_tag: `\\x${cipher.getAuthTag().toString('hex')}`,
    enabled: input.enabled,
  });
  if (error) throw new Error(`LRS configuration save failed: ${error.message}`);
}

function fromBytea(value: string): Buffer {
  return Buffer.from(value.startsWith('\\x') ? value.slice(2) : value, 'hex');
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
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), fromBytea(data.auth_iv));
  decipher.setAuthTag(fromBytea(data.auth_tag));
  const auth = Buffer.concat([
    decipher.update(fromBytea(data.auth_ciphertext)),
    decipher.final(),
  ]).toString('utf8');
  return { endpoint: data.endpoint, auth, enabled: data.enabled };
}
