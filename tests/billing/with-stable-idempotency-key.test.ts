import { describe, expect, test } from 'vitest';
import { withStableIdempotencyKey } from '@/lib/billing/usage-context';

describe('withStableIdempotencyKey', () => {
  test('keeps a valid key supplied by the client', () => {
    const headers = new Headers({ 'Idempotency-Key': 'client-key-12345' });
    expect(withStableIdempotencyKey(headers).get('idempotency-key')).toBe('client-key-12345');
  });

  test('adds a stable key when the client sent none, without touching the request headers', () => {
    const headers = new Headers({ Authorization: 'Bearer x' });
    const stable = withStableIdempotencyKey(headers);
    expect(stable.get('idempotency-key')).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,95}$/);
    expect(stable.get('authorization')).toBe('Bearer x');
    expect(headers.get('idempotency-key')).toBeNull();
  });

  test('replaces a key too short to be stable', () => {
    const stable = withStableIdempotencyKey(new Headers({ 'Idempotency-Key': 'short' }));
    expect(stable.get('idempotency-key')).not.toBe('short');
  });
});
