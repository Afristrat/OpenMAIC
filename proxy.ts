import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Routes that bypass rate limiting
// ---------------------------------------------------------------------------

const SKIP_RATE_LIMIT_PREFIXES = [
  '/api/health',
  '/api/metrics',
  '/_next/',
  '/favicon.ico',
];

function shouldSkipRateLimit(pathname: string): boolean {
  // Only rate-limit /api/ routes (except health & metrics)
  if (!pathname.startsWith('/api/')) return true;
  return SKIP_RATE_LIMIT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Extract client identifier
// ---------------------------------------------------------------------------

function getClientKey(request: NextRequest): { key: string; plan: string } {
  // Try to extract user ID from Supabase auth cookie (sb-*-auth-token)
  const cookies = request.cookies;
  let userId: string | undefined;

  // Supabase stores the session in cookies named sb-<project-ref>-auth-token*
  for (const [name, cookie] of cookies) {
    if (name.startsWith('sb-') && name.includes('-auth-token')) {
      try {
        // The cookie value is a JSON array; the first element contains the access token.
        // We extract the sub claim without a full JWT verify (rate-limiting is best-effort).
        const raw = cookie.value;
        const parsed = JSON.parse(raw);
        const token = Array.isArray(parsed) ? parsed[0] : parsed;
        if (typeof token === 'string') {
          const payloadB64 = token.split('.')[1];
          if (payloadB64) {
            const payload = JSON.parse(atob(payloadB64));
            if (payload.sub) {
              userId = payload.sub as string;
            }
          }
        }
      } catch {
        // Cookie parsing failed — fall through to IP-based limiting
      }
      break;
    }
  }

  if (userId) {
    // TODO: Look up the user's plan from the database/cache
    return { key: `user:${userId}`, plan: 'free' };
  }

  // Fall back to IP-based rate limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? '0.0.0.0';
  return { key: `ip:${ip}`, plan: 'free' };
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (shouldSkipRateLimit(pathname)) {
    return NextResponse.next();
  }

  const { key, plan } = getClientKey(request);
  const result = await checkRateLimit(key, plan);

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
