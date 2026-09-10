import { createHash } from 'node:crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function authorizeXapiDelivery(id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid xAPI outbox identity');
  const { data, error } = await createServiceSupabaseClient()
    .rpc('authorize_xapi_delivery', { p_id: id })
    .abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('xAPI delivery authorization unavailable');
  return data === true;
}

/** UUIDv5 (DNS namespace): stable identity scoped to tenant and durable event key. */
export function xapiDeliveryId(orgId: string, eventKey: string): string {
  if (!orgId || !eventKey) throw new Error('Missing xAPI delivery identity');
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex'))
    .update(JSON.stringify(['qalem-xapi', orgId, eventKey]))
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
