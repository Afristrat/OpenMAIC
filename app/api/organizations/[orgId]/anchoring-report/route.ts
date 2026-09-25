import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { z } from 'zod';

const reportWindowSchema = z
  .object({
    dateFrom: z.string().datetime({ offset: true }),
    dateTo: z.string().datetime({ offset: true }),
  })
  .transform(({ dateFrom, dateTo }) => ({
    from: new Date(dateFrom),
    to: new Date(dateTo),
  }))
  .refine(({ from, to }) => from < to && to.getTime() - from.getTime() <= 366 * 86_400_000);

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError('UNAUTHORIZED', 401, 'Authentification requise');
  const url = new URL(request.url);
  const parsedWindow = reportWindowSchema.safeParse({
    dateFrom: url.searchParams.get('dateFrom'),
    dateTo: url.searchParams.get('dateTo'),
  });
  if (!parsedWindow.success) {
    return apiError('INVALID_REQUEST', 400, 'Période de rapport invalide');
  }
  const from = parsedWindow.data.from.toISOString();
  const to = parsedWindow.data.to.toISOString();
  const { orgId } = await params;
  const { data, error } = await supabase.rpc('anchor_org_report', {
    target_org_id: orgId,
    p_from: from,
    p_to: to,
  });
  if (error) return apiError('UNAUTHORIZED', 403, 'Accès aux agrégats d’ancrage refusé');
  const anchoring = data?.[0] ?? null;
  return apiSuccess({
    anchoring,
    window: { from, to },
    definitions: anchoring
      ? {
          relevance: `Moyenne déclarée ; dénominateur : ${anchoring.hot_relevance_response_count} réponses à chaud.`,
          returnIntent: `Moyenne déclarée ; dénominateur : ${anchoring.hot_return_intent_response_count} réponses à chaud.`,
          application: `Moyenne déclarée ; dénominateur : ${anchoring.cold_application_response_count} réponses à froid.`,
          effectiveResume: `${anchoring.resume_opened_count} ouvertures authentifiées / ${anchoring.resume_sent_count} relances de reprise acceptées.`,
          disclaimer:
            'Aucun gain d’apprentissage n’est déduit de ces indicateurs descriptifs sans comparaison adéquate.',
        }
      : null,
  });
}
