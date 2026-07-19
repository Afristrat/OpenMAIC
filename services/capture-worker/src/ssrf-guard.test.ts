import { describe, it, expect } from 'vitest';
import { validateUrlForSSRF, isPrivateIP } from './ssrf-guard.js';

describe('validateUrlForSSRF (capture-worker port)', () => {
  it('blocks private-network URLs', async () => {
    const result = await validateUrlForSSRF('http://127.0.0.1:8090/admin');
    expect(result).not.toBeNull();
  });

  it('blocks non-http(s) protocols', async () => {
    const result = await validateUrlForSSRF('file:///etc/passwd');
    expect(result).toBe('Only HTTP(S) URLs are allowed');
  });

  it('allows a public IP URL', async () => {
    const result = await validateUrlForSSRF('https://1.1.1.1/');
    expect(result).toBeNull();
  });
});

describe('isPrivateIP (capture-worker port)', () => {
  it('flags 10.x.x.x as private', () => {
    expect(isPrivateIP('10.0.0.5')).toBe(true);
  });

  it('does not flag a public IP as private', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
  });
});
