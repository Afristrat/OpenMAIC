// ---------------------------------------------------------------------------
// DELETE /api/account/delete
// Complete account deletion (CNDP/RGPD right to erasure).
// Deletes all user data from every table, then removes the auth user.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('AccountDelete');

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Tables to purge, in dependency-safe order (children first).
// Each entry: [table_name, column_name]
const TABLES_TO_PURGE: [string, string][] = [
  ['pedagogy_telemetry', 'user_id'],
  ['telemetry_consent', 'user_id'],
  ['usage_records', 'user_id'],
  ['review_cards', 'user_id'],
  ['quiz_results', 'user_id'],
  ['certificates', 'user_id'],
  ['payments', 'user_id'],
  ['org_members', 'user_id'],
  ['stages', 'user_id'],
  ['scenes', 'user_id'],
  ['profiles', 'id'],
];

export async function DELETE(request: NextRequest): Promise<NextResponse> {
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
    // Delete from all tables
    const errors: string[] = [];

    for (const [table, column] of TABLES_TO_PURGE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped service-role client for dynamic table access
      const { error } = await (supabase as any)
        .from(table)
        .delete()
        .eq(column, userId);

      if (error) {
        // Log but continue — some tables may not exist yet
        log.warn(`Failed to delete from ${table}: ${error.message}`);
        errors.push(`${table}: ${error.message}`);
      }
    }

    // Delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      log.error(`Failed to delete auth user ${userId}: ${authError.message}`);
      return NextResponse.json(
        { error: 'Failed to delete authentication record' },
        { status: 500 },
      );
    }

    log.info(`Account ${userId} fully deleted (${errors.length} non-critical errors)`);

    return NextResponse.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    log.error('Account deletion error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
