import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { LtiAdminRequestError, readLtiAdminBody } from '@/lib/lti/admin';

const headers = { 'Cache-Control': 'private, no-store' };
const identifier = z.string().min(1).max(4096);
const kind = z.enum(['resource', 'user']);
const base = z.object({ platformId: z.uuid(), kind });
const createInput = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('resource'), resourceLinkId: identifier, stageId: identifier }).strict(),
  base.extend({ kind: z.literal('user'), lmsSubject: identifier, userId: z.uuid() }).strict(),
]);
const deleteInput = base.extend({ bindingId: z.uuid() }).strict();
const listInput = base.extend({
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
}).strict();
const resourceRow = z.object({ id: z.uuid(), resource_link_id: identifier, stage_id: identifier });
const userRow = z.object({ id: z.uuid(), lms_subject: identifier, user_id: z.uuid() });
const tables = { resource: 'lti_resource_bindings', user: 'lti_user_bindings' } as const;
const fields = { resource: 'id,resource_link_id,stage_id', user: 'id,lms_subject,user_id' } as const;
const schemas = { resource: resourceRow, user: userRow };
const failure = (error: unknown) => NextResponse.json(
  { success: false, error: 'LTI binding operation failed' },
  { status: error instanceof LtiAdminRequestError ? error.status : 503, headers },
);

async function platformContext(platformId: string) {
  const service = createServiceSupabaseClient();
  const result = await service.from('lti_registrations').select('client_id,org_id')
    .eq('id', platformId).maybeSingle();
  if (result.error) throw new Error('LTI registry unavailable');
  if (!result.data) throw new LtiAdminRequestError(404);
  const platform = z.object({ client_id: identifier, org_id: z.uuid().nullable() }).parse(result.data);
  if (platform.org_id) {
    const org = await service.from('organizations').select('id')
      .eq('id', platform.org_id).eq('status', 'active').maybeSingle();
    if (org.error) throw new Error('LTI tenant unavailable');
    if (!org.data) throw new LtiAdminRequestError(403);
  }
  return { service, platform };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const parsed = listInput.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) throw new LtiAdminRequestError(400);
    const { platformId, kind: type, offset } = parsed.data;
    const { service, platform } = await platformContext(platformId);
    if (!platform.org_id)
      return NextResponse.json({ orgId: null, bindings: [], nextOffset: null }, { headers });
    const result = await service.from(tables[type]).select(fields[type])
      .eq('client_id', platform.client_id).eq('org_id', platform.org_id)
      .order('id').range(offset, offset + 100);
    if (result.error) throw new Error('LTI bindings unavailable');
    const bindings = schemas[type].array().parse(result.data);
    return NextResponse.json({
      orgId: platform.org_id,
      bindings: bindings.slice(0, 100),
      nextOffset: bindings.length > 100 ? offset + 100 : null,
    }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const parsed = createInput.safeParse(await readLtiAdminBody(req));
    if (!parsed.success) throw new LtiAdminRequestError(400);
    const input = parsed.data;
    const { service, platform } = await platformContext(input.platformId);
    if (!platform.org_id) throw new LtiAdminRequestError(409);
    const target = input.kind === 'resource'
      ? await service.from('stages').select('id').eq('id', input.stageId)
        .eq('org_id', platform.org_id).maybeSingle()
      : await service.from('org_members').select('user_id').eq('user_id', input.userId)
        .eq('org_id', platform.org_id).maybeSingle();
    if (target.error) throw new Error('LTI target unavailable');
    if (!target.data) throw new LtiAdminRequestError(403);
    // Composite foreign keys recheck tenant membership atomically at insertion.
    const result = await service.from(tables[input.kind]).insert({
      client_id: platform.client_id,
      org_id: platform.org_id,
      ...(input.kind === 'resource'
        ? { resource_link_id: input.resourceLinkId, stage_id: input.stageId }
        : { lms_subject: input.lmsSubject, user_id: input.userId }),
    }).select(fields[input.kind]).single();
    if (result.error) throw new LtiAdminRequestError(
      result.error.code === '23505' ? 409 : result.error.code === '23503' ? 403 : 503,
    );
    return NextResponse.json(schemas[input.kind].parse(result.data), { status: 201, headers });
  } catch (error) { return failure(error); }
}

/** Revocation cascades to sessions, attempts and pending deliveries, not grades already received. */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const parsed = deleteInput.safeParse(await readLtiAdminBody(req));
    if (!parsed.success) throw new LtiAdminRequestError(400);
    const input = parsed.data;
    const { service, platform } = await platformContext(input.platformId);
    if (!platform.org_id) throw new LtiAdminRequestError(409);
    const result = await service.from(tables[input.kind]).delete()
      .eq('id', input.bindingId).eq('client_id', platform.client_id).eq('org_id', platform.org_id)
      .select('id').maybeSingle();
    if (result.error) throw new Error('LTI revocation unavailable');
    if (!result.data) throw new LtiAdminRequestError(404);
    return NextResponse.json({ success: true }, { headers });
  } catch (error) { return failure(error); }
}
