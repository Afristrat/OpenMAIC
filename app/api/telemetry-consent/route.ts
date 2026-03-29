import { NextRequest, NextResponse } from 'next/server';
import { hasConsent, setConsent } from '@/lib/telemetry/pedagogy-collector';

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
  const body = (await request.json()) as { userId?: string; consent?: boolean };
  const { userId, consent } = body;

  if (!userId || typeof consent !== 'boolean') {
    return NextResponse.json({ error: 'Missing userId or consent' }, { status: 400 });
  }

  try {
    await setConsent(userId, consent);
    return NextResponse.json({ ok: true });
  } catch {
    // If Supabase is not configured, silently succeed
    return NextResponse.json({ ok: true });
  }
}
