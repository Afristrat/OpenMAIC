import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, type RequestRateLimitTier } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Routes that bypass rate limiting
// ---------------------------------------------------------------------------

const SKIP_RATE_LIMIT_PREFIXES = ['/api/health', '/api/metrics', '/_next/', '/favicon.ico'];

function shouldSkipRateLimit(pathname: string): boolean {
  // Only rate-limit /api/ routes (except health & metrics)
  if (!pathname.startsWith('/api/')) return true;
  return SKIP_RATE_LIMIT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Extract client identifier
// ---------------------------------------------------------------------------

type CookieEntry = [string, { value: string }];

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readSupabaseSessionCookie(cookies: Iterable<CookieEntry>): string | undefined {
  const wholeCookies = new Map<string, string>();
  const chunkedCookies = new Map<string, Map<number, string>>();

  for (const [name, cookie] of cookies) {
    const match = /^(sb-.+-auth-token)(?:\.(\d+))?$/.exec(name);
    if (!match) continue;

    const baseName = match[1];
    const chunkIndex = match[2];
    if (chunkIndex === undefined) {
      wholeCookies.set(baseName, cookie.value);
      continue;
    }

    const chunks = chunkedCookies.get(baseName) ?? new Map<number, string>();
    chunks.set(Number(chunkIndex), cookie.value);
    chunkedCookies.set(baseName, chunks);
  }

  const wholeCookie = wholeCookies.values().next().value;
  if (typeof wholeCookie === 'string') return wholeCookie;

  for (const chunks of chunkedCookies.values()) {
    const indexes = [...chunks.keys()].sort((left, right) => left - right);
    if (indexes.length === 0 || indexes.some((index, position) => index !== position)) continue;
    return indexes.map((index) => chunks.get(index)).join('');
  }

  return undefined;
}

export function extractAuthenticatedUserIdFromCookies(
  cookies: Iterable<CookieEntry>,
): string | undefined {
  try {
    const storedSession = readSupabaseSessionCookie(cookies);
    if (!storedSession) return undefined;

    const decodedSession = storedSession.startsWith('base64-')
      ? decodeBase64Url(storedSession.slice('base64-'.length))
      : storedSession;
    const parsedSession: unknown = JSON.parse(decodedSession);
    const accessToken =
      typeof parsedSession === 'string'
        ? parsedSession
        : Array.isArray(parsedSession)
          ? parsedSession[0]
          : parsedSession && typeof parsedSession === 'object' && 'access_token' in parsedSession
            ? parsedSession.access_token
            : undefined;

    if (typeof accessToken !== 'string') return undefined;

    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;

    const claims: unknown = JSON.parse(decodeBase64Url(payload));
    if (!claims || typeof claims !== 'object' || !('sub' in claims)) return undefined;
    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : undefined;
  } catch {
    return undefined;
  }
}

function getClientKey(request: NextRequest): { key: string; tier: RequestRateLimitTier } {
  // Identity only partitions rate-limit buckets. API authorization verifies the JWT separately.
  const userId = extractAuthenticatedUserIdFromCookies(request.cookies);

  if (userId) {
    return { key: `user:${userId}`, tier: 'authenticated' };
  }

  // Fall back to IP-based rate limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '0.0.0.0';
  return { key: `ip:${ip}`, tier: 'anonymous' };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (shouldSkipRateLimit(pathname)) {
    return NextResponse.next();
  }

  const { key, tier } = getClientKey(request);
  const result = await checkRateLimit(key, tier);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.retryAfterMs ?? 1000) / 1000);
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter: retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
