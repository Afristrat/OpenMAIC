import { createHash } from 'node:crypto';

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
