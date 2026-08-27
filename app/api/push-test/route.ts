import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  sendWebPushToUser,
  WebPushConfigurationError,
} from '@/lib/server/web-push';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { translate, type Locale } from '@/lib/i18n';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestLocale(request: NextRequest): Locale {
  const language = request.headers.get('accept-language')?.toLowerCase() ?? '';
  if (language.startsWith('ar')) return 'ar-MA';
  if (language.startsWith('en')) return 'en-US';
  return 'fr-FR';
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  if (body?.cardId !== undefined && (typeof body.cardId !== 'string' || !UUID_PATTERN.test(body.cardId))) {
    return apiError('INVALID_REQUEST', 400, 'Carte cible invalide');
  }

  const service = createServiceSupabaseClient();
  let cardQuery = service
    .from('review_cards')
    .select('id')
    .eq('user_id', auth.user.id);
  cardQuery =
    typeof body?.cardId === 'string'
      ? cardQuery.eq('id', body.cardId)
      : cardQuery.lte('due_date', new Date().toISOString()).order('due_date').limit(1);
  const { data: card, error } = await cardQuery.maybeSingle();
  if (error) return apiError('INTERNAL_ERROR', 500, 'Impossible de vérifier la carte cible');
  if (!card) return apiError('INVALID_REQUEST', 404, 'Carte cible introuvable');

  try {
    const deliveries = await sendWebPushToUser(auth.user.id, {
      title: 'Qalem',
      body: translate(requestLocale(request), 'notifications.reviewDue', { count: 1 }),
      targetUrl: `/review?card=${encodeURIComponent(card.id)}`,
      tag: `review-${card.id}`,
    });
    if (deliveries.length === 0) {
      return apiError('INVALID_REQUEST', 409, 'Aucun appareil n’est abonné aux notifications');
    }
    return apiSuccess({
      deliveries,
      accepted: deliveries.filter((delivery) => delivery.status === 'accepted').length,
    });
  } catch (sendError) {
    if (sendError instanceof WebPushConfigurationError) {
      return apiError('PROVIDER_DISABLED', 503, 'Les notifications push ne sont pas configurées');
    }
    return apiError('UPSTREAM_ERROR', 502, 'L’envoi de la notification a échoué');
  }
}
