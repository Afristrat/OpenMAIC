import { createHash } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store' };
const packageLookup = z.object({
  packageId: z.uuid(),
  orgId: z.uuid(),
  deviceId: z.uuid(),
});

function failure(status: number) {
  return NextResponse.json(
    { success: false, error: 'Local package retrieval failed' },
    { status, headers },
  );
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
) {
  const parsed = packageLookup.safeParse({
    packageId: (await params).packageId,
    orgId: req.nextUrl.searchParams.get('orgId'),
    deviceId: req.nextUrl.searchParams.get('deviceId'),
  });
  if (!parsed.success) return failure(400);

  const input = parsed.data;
  const auth = await requireOrgMember(req, input.orgId);
  if (auth.response) return auth.response;

  try {
    const service = createServiceSupabaseClient();
    const license = await service
      .from('local_content_licenses')
      .select('device_id')
      .eq('package_id', input.packageId)
      .eq('org_id', input.orgId)
      .eq('user_id', auth.user.id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (license.error) return failure(503);
    if (!license.data) return failure(404);

    const [packageResult, deviceResult] = await Promise.all([
      service
        .from('local_content_packages')
        .select('artifact_path, ciphertext_sha256')
        .eq('id', input.packageId)
        .eq('org_id', input.orgId)
        .maybeSingle(),
      service
        .from('local_client_devices')
        .select('id')
        .eq('id', license.data.device_id)
        .eq('user_id', auth.user.id)
        .eq('org_id', input.orgId)
        .eq('device_id', input.deviceId)
        .is('revoked_at', null)
        .maybeSingle(),
    ]);
    if (packageResult.error || deviceResult.error) return failure(503);
    if (!packageResult.data || !deviceResult.data) return failure(404);

    const artifact = await service.storage
      .from('local-content-packages')
      .download(packageResult.data.artifact_path);
    if (artifact.error || !artifact.data) return failure(404);
    const content = new Uint8Array(await artifact.data.arrayBuffer());
    if (sha256(content) !== packageResult.data.ciphertext_sha256) return failure(503);

    return new NextResponse(content, {
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${input.packageId}.qalempkg"`,
      },
    });
  } catch {
    return failure(503);
  }
}
