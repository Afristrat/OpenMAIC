import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgMember } from '@/lib/api/auth';
import { issueLocalPackage, LocalContentSigningConfigurationError } from '@/lib/server/local-content-crypto';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const PACKAGE_BUCKET = 'local-content-packages';
const headers = { 'Cache-Control': 'private, no-store' };
const issueInput = z
  .object({
    orgId: z.uuid(),
    sourceId: z.uuid(),
    sourceManifestId: z.uuid().optional(),
    deviceId: z.uuid(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

function failure(status: number) {
  return NextResponse.json(
    { success: false, error: 'Local package operation failed' },
    { status, headers },
  );
}

function packagePayload(source: {
  id: string;
  name: string;
  mime_type: string;
  content_hash: string;
  text_content: string;
}) {
  return Buffer.from(
    JSON.stringify({
      format_version: 1,
      source: {
        id: source.id,
        name: source.name,
        mimeType: source.mime_type,
        contentSha256: source.content_hash,
        text: source.text_content,
      },
    }),
    'utf8',
  );
}

export async function POST(req: NextRequest) {
  const parsed = issueInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return failure(400);
  const input = parsed.data;
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) return failure(400);

  const auth = await requireOrgMember(req, input.orgId);
  if (auth.response) return auth.response;

  try {
    const service = createServiceSupabaseClient();
    const [sourceResult, deviceResult] = await Promise.all([
      service
        .from('organization_sources')
        .select('id, name, mime_type, content_hash, text_content')
        .eq('id', input.sourceId)
        .eq('org_id', input.orgId)
        .eq('status', 'ready')
        .maybeSingle(),
      service
        .from('local_client_devices')
        .select('id, device_id, encryption_public_key')
        .eq('user_id', auth.user.id)
        .eq('org_id', input.orgId)
        .eq('device_id', input.deviceId)
        .is('revoked_at', null)
        .maybeSingle(),
    ]);
    if (sourceResult.error || deviceResult.error) return failure(503);
    if (!sourceResult.data || !deviceResult.data) return failure(404);

    if (input.sourceManifestId) {
      const manifest = await service
        .from('formation_source_manifests')
        .select('id')
        .eq('id', input.sourceManifestId)
        .eq('org_id', input.orgId)
        .contains('source_ids', [input.sourceId])
        .maybeSingle();
      if (manifest.error) return failure(503);
      if (!manifest.data) return failure(404);
    }

    const packageId = randomUUID();
    const payload = packagePayload(sourceResult.data);
    if (payload.byteLength > 5 * 1024 * 1024) return failure(413);
    const issued = issueLocalPackage({
      packageId,
      userId: auth.user.id,
      tenantId: input.orgId,
      deviceId: input.deviceId,
      devicePublicKey: deviceResult.data.encryption_public_key,
      expiresAt,
      content: payload,
    });
    const artifactPath = `${input.orgId}/${packageId}.qalempkg`;
    const artifact = JSON.parse(issued.artifact.toString('utf8')) as {
      key_envelope: unknown;
    };
    const upload = await service.storage
      .from(PACKAGE_BUCKET)
      .upload(artifactPath, issued.artifact, { contentType: 'application/octet-stream', upsert: false });
    if (upload.error) return failure(503);

    const packageInsert = await service
      .from('local_content_packages')
      .insert({
        id: packageId,
        org_id: input.orgId,
        source_id: input.sourceId,
        source_manifest_id: input.sourceManifestId ?? null,
        source_content_sha256: sourceResult.data.content_hash,
        content_sha256: issued.contentSha256,
        ciphertext_sha256: issued.ciphertextSha256,
        artifact_path: artifactPath,
        payload_bytes: payload.byteLength,
      });
    if (packageInsert.error) {
      await service.storage.from(PACKAGE_BUCKET).remove([artifactPath]);
      return failure(503);
    }

    const licenceInsert = await service.from('local_content_licenses').insert({
      device_id: deviceResult.data.id,
      user_id: auth.user.id,
      org_id: input.orgId,
      package_id: packageId,
      content_sha256: issued.contentSha256,
      signed_manifest: issued.license,
      key_envelope: JSON.stringify(artifact.key_envelope),
      expires_at: expiresAt.toISOString(),
    });
    if (licenceInsert.error) {
      await service.from('local_content_packages').delete().eq('id', packageId);
      await service.storage.from(PACKAGE_BUCKET).remove([artifactPath]);
      return failure(503);
    }
    return NextResponse.json(
      { success: true, packageId, expiresAt: expiresAt.toISOString() },
      { status: 201, headers },
    );
  } catch (error) {
    if (error instanceof LocalContentSigningConfigurationError) return failure(503);
    return failure(503);
  }
}
