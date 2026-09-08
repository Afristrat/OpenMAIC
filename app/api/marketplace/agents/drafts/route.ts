import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { validateBody } from '@/lib/api/validate';
import { marketplaceDraftSchema } from '@/lib/marketplace/draft-schema';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** Immutable private snapshot; repeating the same request never updates a publication. */
export async function POST(request: NextRequest): Promise<Response> {
  const validation = validateBody(marketplaceDraftSchema, await request.json().catch(() => null));
  if (!validation.success) return validation.response;
  const { orgId, requestId, agent } = validation.data;
  const auth = await requireSuperAdminOrOrgAuthor(request, orgId);
  if (auth.response) return auth.response;

  const id = `publication-${createHash('sha256')
    .update(JSON.stringify([auth.user.id, orgId, requestId]))
    .digest('hex')}`;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('agent_configs').upsert(
    {
      id,
      owner_id: auth.user.id,
      org_id: orgId,
      name: agent.name,
      role: agent.role,
      persona: agent.persona,
      avatar: agent.avatar ?? null,
      color: agent.color,
      priority: agent.priority,
      allowed_actions: [...new Set(agent.allowedActions)],
      voice_config: agent.voiceConfig ?? null,
      is_published: false,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Unable to save private agent');

  // A successful INSERT with ignored conflicts is not proof of an accessible row.
  const { data: saved, error: readError } = await supabase
    .from('agent_configs')
    .select('id, is_published')
    .eq('id', id)
    .eq('owner_id', auth.user.id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (readError || !saved)
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Unable to verify private agent');
  return apiSuccess({ agentId: saved.id, published: saved.is_published });
}
