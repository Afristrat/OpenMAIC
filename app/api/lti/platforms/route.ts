import { NextResponse, type NextRequest } from 'next/server';
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
