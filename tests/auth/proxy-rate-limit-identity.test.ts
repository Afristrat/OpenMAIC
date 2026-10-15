import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '@/proxy';

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Cookie Supabase SSR non signé : n'importe quel client peut en fabriquer un. */
function forgedSessionCookie(subject: string): string {
  const token = `${encodeBase64Url(JSON.stringify({ alg: 'none' }))}.${encodeBase64Url(
    JSON.stringify({ sub: subject }),
  )}.forged`;
  return `sb-x-auth-token=base64-${encodeBase64Url(JSON.stringify({ access_token: token }))}`;
}

function apiRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/chat', { headers });
}

async function countAllowedBeforeBlock(
  build: (index: number) => NextRequest,
  attempts: number,
): Promise<{ allowed: number; blockedAt: number | null }> {
  let allowed = 0;
  for (let index = 0; index < attempts; index += 1) {
    const response = await proxy(build(index));
    if (response.status === 429) return { allowed, blockedAt: index };
    allowed += 1;
  }
  return { allowed, blockedAt: null };
}

describe('proxy rate limiting identity', () => {
  it('does not grant a fresh bucket when the unverified JWT subject changes on every request', async () => {
    const outcome = await countAllowedBeforeBlock(
      (index) =>
        apiRequest({
          'x-real-ip': '198.51.100.10',
          cookie: forgedSessionCookie(`forged-user-${index}`),
        }),
      1500,
    );

    expect(outcome.blockedAt).not.toBeNull();
    expect(outcome.allowed).toBeLessThanOrEqual(1000);
  });

  it('does not let a forged cookie escape the per-client limit of another client', async () => {
    const outcome = await countAllowedBeforeBlock(
      (index) =>
        apiRequest({
          'x-real-ip': '198.51.100.11',
          cookie: forgedSessionCookie(`forged-user-${index}`),
        }),
      1500,
    );
    const otherClient = await proxy(apiRequest({ 'x-real-ip': '198.51.100.12' }));

    expect(outcome.blockedAt).not.toBeNull();
    expect(otherClient.status).toBe(200);
  });

  it('ignores a spoofed X-Forwarded-For first element and keys on the proxy-set X-Real-IP', async () => {
    const outcome = await countAllowedBeforeBlock(
      (index) =>
        apiRequest({
          'x-real-ip': '198.51.100.20',
          'x-forwarded-for': `203.0.113.${index % 250}, 198.51.100.20`,
        }),
      300,
    );

    expect(outcome.blockedAt).toBe(100);
  });

  it('falls back to the last X-Forwarded-For element, the one appended by the trusted proxy', async () => {
    const outcome = await countAllowedBeforeBlock(
      (index) => apiRequest({ 'x-forwarded-for': `203.0.113.${index % 250}, 198.51.100.30` }),
      300,
    );

    expect(outcome.blockedAt).toBe(100);
  });

  it('collapses malformed client addresses into a single bucket instead of minting new ones', async () => {
    const outcome = await countAllowedBeforeBlock(
      (index) => apiRequest({ 'x-real-ip': `not-an-ip-${index}` }),
      300,
    );

    expect(outcome.blockedAt).toBe(100);
  });
});
