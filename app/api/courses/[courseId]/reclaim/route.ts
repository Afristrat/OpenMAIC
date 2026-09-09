import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store' };
const resultSchema = z.object({
  courseId: z.string().uuid(),
  sourceManifestId: z.string().uuid().nullable(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (
    request.headers.get('origin') !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  ) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  }
  const courseId = z
    .string()
    .uuid()
    .safeParse((await context.params).courseId);
  if (!courseId.success)
    return NextResponse.json({ error: 'Invalid course' }, { status: 400, headers });
  try {
    const result = await createServiceSupabaseClient()
      .rpc('reclaim_orphaned_course', {
        p_actor: auth.user.id,
        p_course: courseId.data,
      })
      .abortSignal(AbortSignal.timeout(10000));
    if (result.error?.code === '42501') {
      return NextResponse.json(
        { error: 'Course unavailable for takeover' },
        { status: 403, headers },
      );
    }
    if (result.error) throw new Error('Reclaim not confirmed');
    return NextResponse.json(resultSchema.parse(result.data), { headers });
  } catch {
    return NextResponse.json(
      { error: 'Course takeover could not be confirmed' },
      { status: 503, headers },
    );
  }
}
