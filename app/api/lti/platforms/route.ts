import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import {
  LtiAdminRequestError,
  ltiPlatformInput,
  ltiPlatformRow,
  LTI_PLATFORM_FIELDS,
  platformView,
  readLtiAdminBody,
} from '@/lib/lti/admin';

const headers = { 'Cache-Control': 'private, no-store' };
const failure = (status: number) =>
  NextResponse.json(
    { success: false, error: 'LTI platform operation failed' },
    { status, headers },
  );
const assignmentInput = z.object({ platformId: z.uuid(), orgId: z.uuid() }).strict();

/** Attach a legacy registration once; never move an existing LMS identity between tenants. */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const parsed = assignmentInput.safeParse(await readLtiAdminBody(req));
    if (!parsed.success) return failure(400);
    const { platformId, orgId } = parsed.data;
    const service = createServiceSupabaseClient();
    const org = await service
      .from('organizations')
      .select('id')
      .eq('id', orgId)
      .eq('status', 'active')
      .maybeSingle();
    if (org.error) return failure(503);
    if (!org.data) return failure(403);
    // The NULL predicate is part of the UPDATE, not a racy read-before-write check.
    const updated = await service
      .from('lti_registrations')
      .update({ org_id: orgId })
      .eq('id', platformId)
      .is('org_id', null)
      .select(LTI_PLATFORM_FIELDS)
      .maybeSingle();
    if (updated.error) return failure(503);
    if (updated.data)
      return NextResponse.json(platformView(ltiPlatformRow.parse(updated.data)), { headers });
    const current = await service
      .from('lti_registrations')
      .select(LTI_PLATFORM_FIELDS)
      .eq('id', platformId)
      .maybeSingle();
    if (current.error) return failure(503);
    if (!current.data) return failure(404);
    const row = ltiPlatformRow.parse(current.data);
    if (row.org_id?.toLowerCase() !== orgId.toLowerCase()) return failure(409);
    return NextResponse.json(platformView(row), { headers });
  } catch (error) {
    return failure(error instanceof LtiAdminRequestError ? error.status : 503);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('lti_registrations')
      .select(LTI_PLATFORM_FIELDS)
      .order('client_id');
    if (error) return failure(503);
    return NextResponse.json(ltiPlatformRow.array().parse(data).map(platformView), { headers });
  } catch {
    return failure(503);
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.response) return auth.response;
  try {
    const parsed = ltiPlatformInput.safeParse(await readLtiAdminBody(req));
    if (!parsed.success) return failure(400);
    const input = parsed.data;
    const unsafe = await Promise.all(
      [input.issuer, input.authUrl, input.tokenUrl, input.jwksUrl].map((url) =>
        validateUrlForSSRF(url, { allowLocalNetworks: false }),
      ),
    );
    if (unsafe.some(Boolean)) return failure(400);
    const service = createServiceSupabaseClient();
    const org = await service
      .from('organizations')
      .select('id')
      .eq('id', input.orgId)
      .eq('status', 'active')
      .maybeSingle();
    if (org.error) return failure(503);
    if (!org.data) return failure(403);
    const { data, error } = await service
      .from('lti_registrations')
      .insert({
        client_id: input.clientId,
        issuer: input.issuer,
        jwks_url: input.jwksUrl,
        auth_url: input.authUrl,
        token_url: input.tokenUrl,
        deployment_id: input.deploymentId,
        org_id: input.orgId,
      })
      .select(LTI_PLATFORM_FIELDS)
      .single();
    if (error) return failure(error.code === '23505' ? 409 : 503);
    return NextResponse.json(platformView(ltiPlatformRow.parse(data)), { status: 201, headers });
  } catch (error) {
    return failure(error instanceof LtiAdminRequestError ? error.status : 503);
  }
}
