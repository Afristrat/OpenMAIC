/**
 * Rédaction par IA pour l'extension de capture, débitée du solde de l'organisation de l'auteur.
 *
 * Le modèle est celui que l'auteur utilise dans son compte Qalem (recopié côté serveur par
 * l'application) : jamais choisi par l'extension, jamais de modèle par défaut. Aucune clé, aucun
 * en-tête de modèle ni de fournisseur du client n'est lu. Entrée bornée, sans image.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { runWithUsageMeteringContext, withStableIdempotencyKey } from '@/lib/billing/usage-context';
import { resolveBillingOrganization } from '@/lib/capture/billing-organization';
import {
  cleanDescribeOutput,
  DESCRIBE_TASKS,
  describeSchema,
  describeSystemPrompt,
  MAX_DESCRIBE_BODY_BYTES,
} from '@/lib/capture/describe';
import { consumeDescribeQuota } from '@/lib/capture/describe-limit';
import { readCapturePreferences } from '@/lib/capture/preferences';
import { requireCaptureToken } from '@/lib/capture/token-auth';
import { createLogger } from '@/lib/logger';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { creditsErrorResponse } from '@/lib/server/credit-error-response';
import { resolveModel } from '@/lib/server/resolve-model';

const log = createLogger('CaptureDescribeAPI');

export async function POST(request: NextRequest) {
  const auth = await requireCaptureToken(request);
  if (auth.response) return auth.response;

  if (!consumeDescribeQuota(auth.tokenId)) {
    const limited = apiError(
      API_ERROR_CODES.RATE_LIMITED,
      429,
      'Trop de demandes, réessayez dans une minute',
    );
    limited.headers.set('Retry-After', '60');
    return limited;
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_DESCRIBE_BODY_BYTES) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Demande trop volumineuse');
  }
  const raw = await request.text();
  if (raw.length > MAX_DESCRIBE_BODY_BYTES) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 413, 'Demande trop volumineuse');
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // corps non JSON : refusé ci-dessous par le schéma
  }
  const parsed = describeSchema.safeParse(body);
  if (!parsed.success) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Demande invalide');
  const { task, prompt } = parsed.data;

  try {
    const [preferences, orgId] = await Promise.all([
      readCapturePreferences(auth.ownerId),
      resolveBillingOrganization(auth.ownerId),
    ]);
    if (!orgId) {
      return apiError(
        API_ERROR_CODES.NO_ORGANIZATION,
        403,
        "Aucune organisation active n'est associée à ce compte",
      );
    }
    if (!preferences.accountModel) {
      return apiError(
        API_ERROR_CODES.MODEL_NOT_SYNCED,
        409,
        'Ouvrez Qalem une fois dans ce navigateur pour que votre modèle soit reconnu',
      );
    }

    // Le seul paramètre de modèle est celui du compte : ni clé, ni URL, ni fournisseur du client.
    let resolved: Awaited<ReturnType<typeof resolveModel>>;
    try {
      resolved = await resolveModel({ modelString: preferences.accountModel });
    } catch {
      return apiError(
        API_ERROR_CODES.MODEL_UNAVAILABLE,
        422,
        "Le modèle de votre compte n'est pas disponible pour la capture",
      );
    }

    const limits = DESCRIBE_TASKS[task];
    const headers = withStableIdempotencyKey(request.headers);
    const result = await runWithUsageMeteringContext(headers, auth.ownerId, orgId, () =>
      callLLM(
        {
          model: resolved.model,
          system: describeSystemPrompt(),
          prompt,
          maxOutputTokens: limits.maxOutputTokens,
        },
        `capture-describe:${task}`,
        { retries: 0 },
        resolved.thinkingConfig,
      ),
    );
    const text = cleanDescribeOutput(result.text);
    if (!text) return apiError(API_ERROR_CODES.GENERATION_FAILED, 502, 'Aucun texte produit');
    const response = apiSuccess({ text });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    const credits = creditsErrorResponse(error);
    if (credits) return credits;
    // Aucun contenu capturé dans les journaux : seulement la tâche et la nature de l'erreur.
    log.error(`Capture describe failed (${task})`, error instanceof Error ? error.name : 'unknown');
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 502, 'La rédaction a échoué');
  }
}
