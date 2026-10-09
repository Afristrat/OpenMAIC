import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type DesignSystemGenerationEvent = {
  org_id: string;
  stage_id?: string | null;
  scene_id?: string | null;
  event_type: 'llm_call' | 'lint_issue' | 'layout_fallback';
  rule_id?: string | null;
  provider_id?: string | null;
  model_id?: string | null;
  prompt_chars?: number | null;
  latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  provider_cost_microunits?: number | null;
  provider_cost_currency?: string | null;
  valuation_status?: 'valued' | 'pending_configuration' | 'unmetered' | null;
};

export function designSystemWarningRuleId(warning: string): string | null {
  if (/police .* remplacée/i.test(warning)) return 'charter_font_mapped';
  if (/contraste .* ajustée|couleur sûre .* appliquée/i.test(warning)) {
    return 'charter_contrast_adjusted';
  }
  if (/couleur invalide ignorée/i.test(warning)) return 'charter_invalid_color';
  return null;
}

export async function recordDesignSystemGenerationEvent(
  event: DesignSystemGenerationEvent,
): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('design_system_generation_events')
    .insert(event);
  if (error) throw new Error(`Design-system telemetry insert failed: ${error.message}`);
}
