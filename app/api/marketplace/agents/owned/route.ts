import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

const querySchema = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d{0,5}$/)
      .transform(Number)
      .default(1),
  })
  .strict();

/** Owner identity comes only from the session, including after leaving a tenant. */
export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid pagination');
  const { page } = query.data;
  const limit = 50;
  const supabase = await createServerSupabaseClient();
  const { data, error, count } = await supabase
    .from('agent_configs')
    .select('id, name, org_id, is_published, description, tags', { count: 'exact' })
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range((page - 1) * limit, page * limit - 1);
  if (error) return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Unable to load owned agents');
  const response = apiSuccess({
    agents: (data ?? []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      orgId: agent.org_id,
      published: agent.is_published,
      description: agent.description,
      tags: agent.tags ?? [],
    })),
    pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
