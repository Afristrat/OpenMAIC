import { describe, it, expect, afterEach } from 'vitest';
import { isAuthorized } from './auth.js';

describe('isAuthorized', () => {
  const originalToken = process.env.CAPTURE_WORKER_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.CAPTURE_WORKER_TOKEN;
    else process.env.CAPTURE_WORKER_TOKEN = originalToken;
  });

  it('fails closed when CAPTURE_WORKER_TOKEN is not configured', () => {
    delete process.env.CAPTURE_WORKER_TOKEN;
    expect(isAuthorized('Bearer anything')).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    expect(isAuthorized(undefined)).toBe(false);
  });

  it('rejects a header without the Bearer prefix', () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    expect(isAuthorized('secret-token')).toBe(false);
  });

  it('rejects a wrong token', () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    expect(isAuthorized('Bearer wrong-token')).toBe(false);
  });

  it('accepts the correct bearer token', () => {
    process.env.CAPTURE_WORKER_TOKEN = 'secret-token';
    expect(isAuthorized('Bearer secret-token')).toBe(true);
  });
});
