import { type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  deleteWebPushSubscription,
  getWebPushPublicKey,
  saveWebPushSubscription,
  validateBrowserPushSubscription,
  WebPushConfigurationError,
  WebPushSubscriptionConflictError,
} from '@/lib/server/web-push';

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  try {
    return apiSuccess({ publicKey: getWebPushPublicKey() });
  } catch (error) {
    if (error instanceof WebPushConfigurationError) {
      return apiError('PROVIDER_DISABLED', 503, 'Les notifications push ne sont pas configurées');
    }
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const subscription = validateBrowserPushSubscription(await request.json().catch(() => null));
  if (!subscription) return apiError('INVALID_REQUEST', 400, 'Souscription push invalide');

  try {
    await saveWebPushSubscription(auth.user.id, subscription);
    return apiSuccess({ subscribed: true }, 201);
  } catch (error) {
    if (error instanceof WebPushSubscriptionConflictError) {
      return apiError(
        'INVALID_REQUEST',
        409,
        'Cette souscription appartient déjà à un autre compte',
      );
    }
    return apiError('INTERNAL_ERROR', 500, 'Impossible d’enregistrer la souscription push');
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    return apiError('INVALID_REQUEST', 400, 'Point de terminaison push invalide');
  }

  try {
    await deleteWebPushSubscription(auth.user.id, endpoint);
    return apiSuccess({ subscribed: false });
  } catch {
    return apiError('INTERNAL_ERROR', 500, 'Impossible de supprimer la souscription push');
  }
}
