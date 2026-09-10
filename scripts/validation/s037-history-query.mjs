// Read-only PostgREST compatibility check against an explicitly synthetic scope.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
assert(process.argv.includes('--check-qalem-history'), 'Explicit execution flag required');
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(base && key, 'Qalem runtime environment required');
const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
const scope = '00000000-0037-4000-8000-000000000999';
const result = await db
  .from('courses')
  .select('stage_id')
  .eq('org_id', scope)
  .eq('owner_id', scope)
  .eq('status', 'ready')
  .eq('language', 'fr-FR')
  .contains('outline', { analyticsContext: { level: 'beginner', subjectTags: ['s037-proof'] } })
  .not('stage_id', 'is', null)
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(1000)
  .abortSignal(AbortSignal.timeout(5000));
assert(!result.error, 'History query rejected; provider details withheld');
assert.deepEqual(result.data, [], 'Synthetic scope is not empty');
console.log(
  JSON.stringify({
    historyQueryAccepted: true,
    rows: result.data.length,
    optimizationEnabled: process.env.QALEM_DATA_OPTIMIZATION_ENABLED === 'true',
  }),
);
