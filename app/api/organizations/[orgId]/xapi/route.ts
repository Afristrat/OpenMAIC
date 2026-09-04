import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { saveOrganizationLrsConfig, validateLrsEndpoint } from '@/lib/server/org-lrs-config';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const configSchema = z
  .object({
    endpoint: z.string().min(1).max(2048),
    auth: z.string().min(1).max(4096),
    enabled: z.boolean(),
  })
  .strict();

async function requireAdmin(orgId: string) {
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const { data } = await auth
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();
  return data ? user : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  if (!(await requireAdmin(orgId)))
    return apiError('UNAUTHORIZED', 403, 'Accès administrateur requis');
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from('organization_lrs_configs')
    .select('endpoint, enabled, updated_at')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return apiError('INTERNAL_ERROR', 500, 'Échec de lecture de la configuration LRS');
  return apiSuccess({ configured: Boolean(data), config: data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  if (!(await requireAdmin(orgId)))
    return apiError('UNAUTHORIZED', 403, 'Accès administrateur requis');
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('INVALID_REQUEST', 400, 'Configuration LRS invalide');
  try {
    validateLrsEndpoint(parsed.data.endpoint);
    await saveOrganizationLrsConfig({ orgId, ...parsed.data });
    return apiSuccess({ saved: true });
  } catch (error) {
    return apiError(
      'INVALID_REQUEST',
      400,
      'Configuration LRS invalide',
      error instanceof Error ? error.message : undefined,
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  if (!(await requireAdmin(orgId)))
    return apiError('UNAUTHORIZED', 403, 'Accès administrateur requis');
  const service = createServiceSupabaseClient();
  const { error } = await service.from('organization_lrs_configs').delete().eq('org_id', orgId);
  if (error) return apiError('INTERNAL_ERROR', 500, 'Échec de suppression de la configuration LRS');
  return apiSuccess({ deleted: true });
}
