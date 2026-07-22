import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('TransmissionDetailAPI');

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');

  const { id } = await context.params;
  const { data: transmission, error } = await supabase
    .from('transmissions')
    .select(
      'id, stage_id, sender_user_id, recipient_user_id, status, source_artifact_path, audio_watermark_path, visual_watermark_path, error, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    log.error('Transmission detail lookup failed', error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire la transmission');
  }
  if (!transmission) return apiError('INVALID_REQUEST', 404, 'Transmission introuvable');

  const recipient = await createServiceSupabaseClient()
    .from('profiles')
    .select('nickname')
    .eq('id', transmission.recipient_user_id)
    .maybeSingle();
  if (recipient.error) {
    log.error('Transmission recipient lookup failed', recipient.error.message);
    return apiError('INTERNAL_ERROR', 500, 'Impossible de lire le destinataire');
  }

  return apiSuccess({
    transmission: {
      ...transmission,
      recipientName: recipient.data?.nickname?.trim() || 'vous',
      isRecipient: transmission.recipient_user_id === user.id,
    },
  });
}
