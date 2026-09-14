import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgMember } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const headers = { 'Cache-Control': 'private, no-store' };
const encryptionPublicKey = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const deviceInput = z
  .object({
    orgId: z.uuid(),
    deviceId: z.uuid(),
    encryptionPublicKey,
    label: z.string().trim().min(1).max(120),
  })
  .strict();
const organizationLookup = z.object({ orgId: z.uuid() }).strict();
const deviceLookup = z.object({ orgId: z.uuid(), deviceId: z.uuid() }).strict();

function failure(status: number) {
  return NextResponse.json(
    { success: false, error: 'Local device operation failed' },
    { status, headers },
  );
}

function deviceView(device: {
  id: string;
  device_id: string;
  label: string;
  enrolled_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}) {
  return {
    id: device.id,
    deviceId: device.device_id,
    label: device.label,
    enrolledAt: device.enrolled_at,
    lastSeenAt: device.last_seen_at,
    revokedAt: device.revoked_at,
  };
}

export async function GET(req: NextRequest) {
  const parsed = organizationLookup.safeParse({ orgId: req.nextUrl.searchParams.get('orgId') });
  if (!parsed.success) return failure(400);
  const auth = await requireOrgMember(req, parsed.data.orgId);
  if (auth.response) return auth.response;
  try {
    const { data, error } = await createServiceSupabaseClient()
      .from('local_client_devices')
      .select('id, device_id, label, enrolled_at, last_seen_at, revoked_at')
      .eq('user_id', auth.user.id)
      .eq('org_id', parsed.data.orgId)
      .order('last_seen_at', { ascending: false });
    if (error) return failure(503);
    return NextResponse.json({ success: true, devices: (data ?? []).map(deviceView) }, { headers });
  } catch {
    return failure(503);
  }
}

export async function POST(req: NextRequest) {
  const parsed = deviceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return failure(400);
  const input = parsed.data;
  const auth = await requireOrgMember(req, input.orgId);
  if (auth.response) return auth.response;
  try {
    const service = createServiceSupabaseClient();
    const existing = await service
      .from('local_client_devices')
      .select('id, encryption_public_key, revoked_at')
      .eq('user_id', auth.user.id)
      .eq('org_id', input.orgId)
      .eq('device_id', input.deviceId)
      .maybeSingle();
    if (existing.error) return failure(503);
    if (existing.data?.revoked_at) return failure(409);
    if (existing.data && existing.data.encryption_public_key !== input.encryptionPublicKey) {
      return failure(409);
    }
    const now = new Date().toISOString();
    const mutation = existing.data
      ? service
          .from('local_client_devices')
          .update({ label: input.label, last_seen_at: now })
          .eq('id', existing.data.id)
      : service.from('local_client_devices').insert({
          user_id: auth.user.id,
          org_id: input.orgId,
          device_id: input.deviceId,
          encryption_public_key: input.encryptionPublicKey,
          label: input.label,
        });
    const { data, error } = await mutation
      .select('id, device_id, label, enrolled_at, last_seen_at, revoked_at')
      .single();
    if (error || !data) return failure(503);
    return NextResponse.json(
      { success: true, device: deviceView(data) },
      { status: existing.data ? 200 : 201, headers },
    );
  } catch {
    return failure(503);
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = deviceLookup.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return failure(400);
  const input = parsed.data;
  const auth = await requireOrgMember(req, input.orgId);
  if (auth.response) return auth.response;
  try {
    const service = createServiceSupabaseClient();
    const existing = await service
      .from('local_client_devices')
      .select('id, revoked_at')
      .eq('user_id', auth.user.id)
      .eq('org_id', input.orgId)
      .eq('device_id', input.deviceId)
      .maybeSingle();
    if (existing.error) return failure(503);
    if (!existing.data) return failure(404);
    if (existing.data.revoked_at) return new NextResponse(null, { status: 204, headers });
    const revokedAt = new Date().toISOString();
    const device = await service
      .from('local_client_devices')
      .update({ revoked_at: revokedAt, last_seen_at: revokedAt })
      .eq('id', existing.data.id)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (device.error) return failure(503);
    if (!device.data) return new NextResponse(null, { status: 204, headers });
    const licenses = await service
      .from('local_content_licenses')
      .update({ revoked_at: revokedAt })
      .eq('device_id', existing.data.id)
      .is('revoked_at', null);
    if (licenses.error) return failure(503);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return failure(503);
  }
}
