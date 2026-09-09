import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const parsed = z
    .object({ orgId: z.string().uuid(), after: z.string().uuid().optional() })
    .safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid query' }, { status: 400, headers });
  try {
    const db = await createServerSupabaseClient();
    const { data: membership, error: membershipError } = await db
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', parsed.data.orgId)
      .eq('user_id', auth.user.id)
      .eq('role', 'admin')
      .eq('organizations.status', 'active')
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (membershipError) throw new Error('Membership unavailable');
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    let query = db
      .from('courses')
      .select('id, title, language, status, stage_id')
      .eq('org_id', parsed.data.orgId)
      .is('owner_id', null)
      .order('id', { ascending: true })
      .limit(51);
    if (parsed.data.after) query = query.gt('id', parsed.data.after);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Courses unavailable');
    const courses = (data ?? []).slice(0, 50);
    return NextResponse.json(
      { courses, nextCursor: (data?.length ?? 0) > 50 ? courses[49].id : null },
      { headers },
    );
  } catch {
    return NextResponse.json({ error: 'Courses could not be loaded' }, { status: 503, headers });
  }
}
