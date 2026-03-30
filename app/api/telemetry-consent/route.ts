import { NextRequest, NextResponse } from 'next/server';
import { hasConsent, setConsent } from '@/lib/telemetry/pedagogy-collector';
import { validateBody } from '@/lib/api/validate';
import { telemetryConsentSchema } from '@/lib/api/schemas';

/**
 * GET /api/telemetry-consent?userId=...
 * Check whether a user has given pedagogy telemetry consent.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ hasConsent: false });
  }

  try {
    const consented = await hasConsent(userId);
    return NextResponse.json({ hasConsent: consented });
  } catch {
    // If Supabase is not configured, treat as no consent recorded
    return NextResponse.json({ hasConsent: false });
  }
}

/**
 * POST /api/telemetry-consent
 * Set or update a user's pedagogy telemetry consent.
 * Body: { userId: string, consent: boolean }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.json();
  const validation = validateBody(telemetryConsentSchema, rawBody);
  if (!validation.success) return validation.response;
  const { userId, consent } = validation.data;

  try {
    await setConsent(userId, consent);
    return NextResponse.json({ ok: true });
  } catch {
    // If Supabase is not configured, silently succeed
    return NextResponse.json({ ok: true });
  }
}
