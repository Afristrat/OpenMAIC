import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  accessCodeThrottleStatus,
  clearAccessCodeFailures,
  recordAccessCodeFailure,
} from '@/lib/server/access-code-throttle';
import { ACCESS_TOKEN_MAX_AGE_SECONDS, createAccessToken } from '@/lib/server/access-token';
import { rateLimitBucketForIp, trustedClientIp } from '@/lib/server/client-ip-bucket';

export async function POST(request: Request) {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return apiSuccess({ valid: true });
  }

  // Limite d'essais par adresse (seau /64 en IPv6) : 5 échecs par minute puis blocage de 15 minutes,
  // avant toute comparaison, bon code compris.
  const throttleKey = `access-code:${rateLimitBucketForIp(trustedClientIp(request.headers))}`;
  const throttle = accessCodeThrottleStatus(throttleKey);
  if (throttle.blocked) {
    const response = apiError('RATE_LIMITED', 429, 'Too many attempts. Try again later.');
    response.headers.set('Retry-After', String(throttle.retryAfterSeconds));
    return response;
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  // Constant-time comparison
  if (!body.code || typeof body.code !== 'string') {
    recordAccessCodeFailure(throttleKey);
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }
  const encoder = new TextEncoder();
  const a = encoder.encode(body.code);
  const b = encoder.encode(accessCode);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    recordAccessCodeFailure(throttleKey);
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }
  clearAccessCodeFailures(throttleKey);

  const token = createAccessToken(accessCode);
  const cookieStore = await cookies();
  cookieStore.set('openmaic_access', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });

  return apiSuccess({ valid: true });
}
