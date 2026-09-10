import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store' };

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if (request.headers.get('origin') !== expectedOrigin) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  }

  try {
    // Auth deletion and its database cascades are one transaction. Never purge
    // application tables first: a restrictive reference must roll everything back.
    const { error } = await createServiceSupabaseClient(
      AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    ).auth.admin.deleteUser(auth.user.id, false);
    if (error) throw new Error('Account deletion not confirmed');
    // Acknowledge Auth deletion, not erasure of external files, retained business
    // records, or immediate invalidation of already-issued JWTs.
    return NextResponse.json({ success: true, accountDeleted: true }, { headers });
  } catch {
    // A transport failure may occur after commit; never assert that nothing changed.
    return NextResponse.json(
      { error: 'Account deletion could not be confirmed' },
      { status: 503, headers },
    );
  }
}
