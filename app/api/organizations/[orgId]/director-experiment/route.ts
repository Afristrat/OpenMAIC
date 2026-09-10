import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAdmin } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { buildDirectorExperimentReport } from '@/lib/orchestration/director-experiment-report';

const scope = z.object({ orgId: z.uuid(), stageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params;
    const parsed = scope.safeParse({ orgId, stageId: request.nextUrl.searchParams.get('stageId') });
    if (!parsed.success)
      return NextResponse.json({ error: 'Invalid experiment scope' }, { status: 400, headers });
    const auth = await requireOrgAdmin(request, orgId);
    if (auth.response) {
      auth.response.headers.set('Cache-Control', 'private, no-store');
      return auth.response;
    }
    const { data, error } = await createServiceSupabaseClient()
      .rpc('read_director_experiment', {
        p_actor: auth.user.id,
        p_org: orgId,
        p_stage: parsed.data.stageId,
      })
      .abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(5000)]));
    if (error?.code === '42501')
      return NextResponse.json({ error: 'Experiment scope denied' }, { status: 403, headers });
    if (error) throw new Error('Experiment unavailable');
    return NextResponse.json(buildDirectorExperimentReport(data), { headers });
  } catch {
    return NextResponse.json({ error: 'Experiment report unavailable' }, { status: 503, headers });
  }
}
