import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store' };
const agentId = z.string().min(1).max(200);
const querySchema = z.object({ orgId: z.string().uuid(), after: agentId.optional() }).strict();
const bodySchema = z.object({ orgId: z.string().uuid(), agentId }).strict();
const pageSchema = z.object({
  agents: z.array(z.object({ id: agentId, name: z.string() })).max(50),
  nextCursor: agentId.nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success)
    return NextResponse.json({ error: 'Invalid query' }, { status: 400, headers });
  try {
    const result = await createServiceSupabaseClient(
      AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    ).rpc('list_recoverable_tenant_agents', {
      p_actor: auth.user.id,
      p_org: query.data.orgId,
      p_after: query.data.after ?? '',
    });
    if (result.error) throw new Error();
    if (result.data === null)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    return NextResponse.json({ success: true, ...pageSchema.parse(result.data) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Agent recovery unavailable' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  if (
    request.headers.get('origin') !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  )
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers });
  try {
    const result = await createServiceSupabaseClient(
      AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    ).rpc('reclaim_detached_tenant_agent', {
      p_actor: auth.user.id,
      p_org: body.data.orgId,
      p_agent: body.data.agentId,
    });
    if (result.error) throw new Error();
    if (result.data !== body.data.agentId)
      return NextResponse.json({ error: 'Agent not reclaimed' }, { status: 409, headers });
    return NextResponse.json({ success: true, reclaimed: true, agentId: result.data }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Agent recovery could not be confirmed' },
      { status: 503, headers },
    );
  }
}
