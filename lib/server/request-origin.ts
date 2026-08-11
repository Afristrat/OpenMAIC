import type { NextRequest } from 'next/server';

export function buildRequestOrigin(req: NextRequest): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Ignore malformed optional configuration and derive the request origin.
    }
  }

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!forwardedHost) return req.nextUrl.origin;

  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const localHost =
    /^(?:localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/i.test(
      forwardedHost,
    );
  const protocol = localHost ? forwardedProto || 'http' : 'https';
  return `${protocol}://${forwardedHost}`;
}
