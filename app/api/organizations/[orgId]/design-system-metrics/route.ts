import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isSuperAdminEmail } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return apiError('INVALID_REQUEST', 401, 'Authentication required');

  if (!isSuperAdminEmail(user.email ?? '')) {
    const { data: membership, error } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return apiError('INTERNAL_ERROR', 503, 'Organization access unavailable');
    if (!membership || membership.role !== 'admin') {
      return apiError('INVALID_REQUEST', 403, 'Organization administrator access required');
    }
  }

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromInput = request.nextUrl.searchParams.get('from');
  const from = fromInput ? new Date(fromInput) : defaultFrom;
  if (
    !Number.isFinite(from.getTime()) ||
    from > now ||
    now.getTime() - from.getTime() > 90 * 86400000
  ) {
    return apiError('INVALID_REQUEST', 400, 'Metrics window must be within the last 90 days');
  }

  const { data, error } = await createServiceSupabaseClient()
    .from('design_system_generation_events')
    .select(
      'event_type, scene_id, rule_id, prompt_chars, latency_ms, input_tokens, output_tokens, provider_cost_microunits, provider_cost_currency, valuation_status',
    )
    .eq('org_id', orgId)
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) return apiError('INTERNAL_ERROR', 503, 'Design-system metrics unavailable');

  const events = data ?? [];
  const llm = events.filter((event) => event.event_type === 'llm_call');
  const costs = llm.filter((event) => event.valuation_status === 'valued');
  const pendingCosts = llm.filter(
    (event) => event.valuation_status === 'pending_configuration',
  ).length;
  const ruleCounts: Record<string, number> = {};
  for (const event of events) {
    if (event.event_type === 'lint_issue' && event.rule_id) {
      ruleCounts[event.rule_id] = (ruleCounts[event.rule_id] ?? 0) + 1;
    }
  }
  const mean = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => typeof value === 'number');
    return present.length
      ? present.reduce((total, value) => total + value, 0) / present.length
      : null;
  };
  const costsByCurrency: Record<string, number> = {};
  const sceneCostsByCurrency: Record<string, Record<string, number>> = {};
  for (const event of costs) {
    const currency = event.provider_cost_currency;
    if (!currency || event.provider_cost_microunits === null) continue;
    costsByCurrency[currency] = (costsByCurrency[currency] ?? 0) + event.provider_cost_microunits;
    if (event.scene_id) {
      sceneCostsByCurrency[currency] ??= {};
      sceneCostsByCurrency[currency][event.scene_id] =
        (sceneCostsByCurrency[currency][event.scene_id] ?? 0) + event.provider_cost_microunits;
    }
  }
  const averageCostPerSceneByCurrency = Object.fromEntries(
    Object.entries(sceneCostsByCurrency).map(([currency, scenes]) => {
      const amounts = Object.values(scenes);
      return [
        currency,
        {
          averageMicrounits: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
          measuredScenes: amounts.length,
        },
      ];
    }),
  );
  const response = apiSuccess({
    windowStart: from.toISOString(),
    truncated: events.length === 5000,
    calls: llm.length,
    lintIssuesByRule: ruleCounts,
    layoutFallbacks: events.filter((event) => event.event_type === 'layout_fallback').length,
    averagePromptChars: mean(llm.map((event) => event.prompt_chars)),
    averageLatencyMs: mean(llm.map((event) => event.latency_ms)),
    averageTokens: {
      input: mean(llm.map((event) => event.input_tokens)),
      output: mean(llm.map((event) => event.output_tokens)),
    },
    providerCost: {
      byCurrencyMicrounits: costsByCurrency,
      averagePerSceneByCurrency: averageCostPerSceneByCurrency,
      pendingConfigurationCalls: pendingCosts,
      unmeteredCalls: llm.filter((event) => event.valuation_status === 'unmetered').length,
    },
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
