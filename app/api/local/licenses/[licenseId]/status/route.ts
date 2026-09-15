import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { signLocalLicenseStatus } from '@/lib/server/local-content-crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const statusInput = z.object({ licenseId: z.uuid(), deviceId: z.uuid() }).strict();
const headers = { 'Cache-Control': 'private, no-store' };
const STATUS_TTL_SECONDS = 5 * 60;

function failure(status: number) {
  return NextResponse.json(
    { success: false, error: 'Local licence status unavailable' },
    { status, headers },
  );
}

/**
 * The local native client must fail closed when it cannot obtain a fresh,
 * signed status. This route returns no source or user data: only the status
 * bound to the opaque licence and enrolled device identifiers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ licenseId: string }> },
) {
  const parsed = statusInput.safeParse({
    licenseId: (await params).licenseId,
    deviceId: req.nextUrl.searchParams.get('deviceId'),
  });
  if (!parsed.success) return failure(400);

  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from('local_content_licenses')
      .select('id, expires_at, revoked_at, local_client_devices!inner(device_id)')
      .eq('id', parsed.data.licenseId)
      .eq('local_client_devices.device_id', parsed.data.deviceId)
      .maybeSingle();
    if (error) return failure(503);
    if (!data) return failure(404);

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = Math.floor(new Date(data.expires_at).getTime() / 1000);
    if (!Number.isFinite(expiresAt)) return failure(503);
    return NextResponse.json(
      {
        success: true,
        status: signLocalLicenseStatus({
          format_version: 1,
          license_id: data.id,
          device_id: parsed.data.deviceId,
          revoked: data.revoked_at !== null || expiresAt <= now,
          checked_at: now,
          valid_until: now + STATUS_TTL_SECONDS,
        }),
      },
      { headers },
    );
  } catch {
    return failure(503);
  }
}
