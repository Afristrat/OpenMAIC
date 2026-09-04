import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await createServerSupabaseClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const { id } = await params;
  const { data: delivery } = await auth
    .from('anchor_deliveries')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!delivery) return apiError('INVALID_REQUEST', 404, 'Rappel introuvable');
  const service = createServiceSupabaseClient();
  const { error } = await service
    .from('anchor_deliveries')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', id)
    .not('sent_at', 'is', null)
    .is('opened_at', null);
  if (error) return apiError('INTERNAL_ERROR', 500, 'Échec d’ouverture du rappel');
  return apiSuccess({ opened: true });
}
