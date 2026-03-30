// ---------------------------------------------------------------------------
// GET /api/account/export
// Export all user data as JSON (CNDP/RGPD data portability).
// Returns a downloadable JSON file with data from all tables.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('AccountExport');

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Tables to export: [table_name, column_name]
const TABLES_TO_EXPORT: [string, string][] = [
  ['profiles', 'id'],
  ['org_members', 'user_id'],
  ['stages', 'user_id'],
  ['scenes', 'user_id'],
  ['quiz_results', 'user_id'],
  ['review_cards', 'user_id'],
  ['certificates', 'user_id'],
  ['payments', 'user_id'],
  ['usage_records', 'user_id'],
  ['telemetry_consent', 'user_id'],
  ['pedagogy_telemetry', 'user_id'],
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;

  const userId = auth.user.id;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 },
    );
  }

  try {
    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      userId,
      email: auth.user.email,
    };

    for (const [table, column] of TABLES_TO_EXPORT) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client for dynamic table access
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .eq(column, userId);

      if (error) {
        // Table may not exist — skip gracefully
        log.warn(`Export: skipping ${table} — ${error.message}`);
        exportData[table] = { error: 'Table not accessible' };
      } else {
        exportData[table] = data ?? [];
      }
    }

    const jsonString = JSON.stringify(exportData, null, 2);
    const filename = `qalem-data-export-${userId.slice(0, 8)}-${Date.now()}.json`;

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    log.error('Account export error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
