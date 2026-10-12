/**
 * Audits the design of a generated course against the adaptive design linter: contrast measured
 * on the card or banner under each text, palette, fonts, safe area. Read-only.
 *
 *   tsx scripts/design-audit.ts <stageId>
 *
 * Exit code 1 when a slide still carries a linter error; a repaired issue is reported as a
 * warning because the course was persisted with the faulty value.
 */
import type { Slide } from '@openmaic/dsl';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { lintAndRepairAdaptiveSlide } from '@/lib/edit/adaptive-slide-linter';
import { normalizeDesignDirective } from '@/lib/branding/design-directive';

const stageId = process.argv[2];
if (!stageId) {
  console.error('Usage: tsx scripts/design-audit.ts <stageId>');
  process.exit(2);
}

const supabase = createServiceSupabaseClient();
const { data: stage, error: stageError } = await supabase
  .from('stages')
  .select('extra')
  .eq('id', stageId)
  .maybeSingle();
if (stageError || !stage) {
  console.error(`Stage ${stageId} not found: ${stageError?.message ?? 'no row'}`);
  process.exit(2);
}
const extra = (stage.extra ?? {}) as Record<string, unknown>;
const directive = normalizeDesignDirective(extra.designDirective).directive;
const brandSnapshot = extra.brandSnapshot as Parameters<
  typeof lintAndRepairAdaptiveSlide
>[1]['brandSnapshot'];

const { data: scenes, error: scenesError } = await supabase
  .from('scenes')
  .select('id, order, type, content')
  .eq('stage_id', stageId)
  .order('order');
if (scenesError) {
  console.error(`Scenes unreadable: ${scenesError.message}`);
  process.exit(2);
}

let errors = 0;
let warnings = 0;
for (const scene of scenes ?? []) {
  if (scene.type !== 'slide') continue;
  const canvas = (scene.content as { canvas?: Slide } | null)?.canvas;
  if (!canvas) continue;
  const { issues } = lintAndRepairAdaptiveSlide(canvas, { directive, brandSnapshot });
  const sceneErrors = issues.filter((issue) => issue.severity === 'error');
  const sceneWarnings = issues.filter((issue) => issue.severity === 'warning');
  errors += sceneErrors.length;
  warnings += sceneWarnings.length;
  console.log(
    `scene ${scene.order}: ${sceneErrors.length} error(s), ${sceneWarnings.length} warning(s)`,
  );
  for (const issue of issues) {
    console.log(`  [${issue.severity}] ${issue.ruleId} ${issue.elementId ?? ''}: ${issue.message}`);
  }
}
console.log(`TOTAL ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
