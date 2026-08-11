import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { buildRequestOrigin } from '@/lib/server/request-origin';

function request(headers: Record<string, string>, url = 'http://internal:3000/api/test') {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as NextRequest;
}

describe('public classroom origin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the configured public application origin first', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma/app');
    expect(buildRequestOrigin(request({ 'x-forwarded-host': 'internal:3000' }))).toBe(
      'https://qalem.ma',
    );
  });

  it('defaults a public forwarded host to HTTPS when the proxy omits its protocol', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(buildRequestOrigin(request({ 'x-forwarded-host': 'qalem.ma' }))).toBe(
      'https://qalem.ma',
    );
  });

  it('keeps local development on HTTP', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(buildRequestOrigin(request({ 'x-forwarded-host': 'localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
  });

  it('keeps a public URL on HTTPS behind an HTTP TLS-termination hop', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(
      buildRequestOrigin(request({ 'x-forwarded-host': 'qalem.ma', 'x-forwarded-proto': 'http' })),
    ).toBe('https://qalem.ma');
  });
});
