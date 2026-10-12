/**
 * Re-extracts the charter of an organization from its own website, with the current extractor.
 * The previous charter is kept in `settings.brandDesignSystemHistory` so the change can be undone.
 *
 *   tsx scripts/brand-reextract.ts <orgId> [--apply]
 *
 * Without --apply it only prints the difference (dry run). Courses already generated keep the
 * snapshot of their charter: only the next generations follow the refreshed charter.
 */
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { extractOrganizationDesignSystem } from '@/lib/server/organization-brand-extractor';
import { organizationDesignSystemFromSettings } from '@/lib/branding/organization-design-system';

const HISTORY_KEY = 'brandDesignSystemHistory';

async function main(): Promise<void> {
  const [orgId, flag] = process.argv.slice(2);
  if (!orgId) {
    console.error('Usage: tsx scripts/brand-reextract.ts <orgId> [--apply]');
    process.exit(2);
  }
  const supabase = createServiceSupabaseClient();
  const { data: organization, error } = await supabase
    .from('organizations')
    .select('id, name, settings')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !organization) {
    console.error(`Organization ${orgId} not found: ${error?.message ?? 'no row'}`);
    process.exit(2);
  }
  const settings = (organization.settings ?? {}) as Record<string, unknown>;
  const current = organizationDesignSystemFromSettings(settings);
  if (!current) {
    console.error(`${organization.name}: no charter to refresh (no source site saved)`);
    process.exit(2);
  }

  const refreshed = await extractOrganizationDesignSystem(current.sourceUrl);
  const colors = (design: typeof current) =>
    design.palette.map((token) => `${token.name}=${token.hex}`).join(' ');
  console.log(`${organization.name} (${current.sourceUrl})`);
  console.log(`  before: ${colors(current)} | ${current.typography.display}`);
  console.log(`  after : ${colors(refreshed)} | ${refreshed.typography.display}`);
  if (refreshed.inferred.length > 0) console.log(`  inferred: ${refreshed.inferred.join(' ; ')}`);
  if (flag !== '--apply') {
    console.log('  dry run: nothing written (add --apply)');
    return;
  }

  const history = Array.isArray(settings[HISTORY_KEY]) ? (settings[HISTORY_KEY] as unknown[]) : [];
  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      settings: {
        ...settings,
        brandDesignSystem: refreshed,
        [HISTORY_KEY]: [...history, { replacedAt: new Date().toISOString(), value: current }],
      },
    })
    .eq('id', orgId);
  if (updateError) {
    console.error(`Update failed: ${updateError.message}`);
    process.exit(1);
  }
  console.log('  applied; previous charter saved in settings.brandDesignSystemHistory');
}

void main();
