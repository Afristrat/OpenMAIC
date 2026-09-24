import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20260924223000_allow_xapi_cleanup_on_account_deletion.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('xAPI cleanup during account deletion', () => {
  it('keeps the owner check for direct updates', () => {
    expect(migration).toMatch(/TG_OP <> 'DELETE'[\s\S]*auth\.uid\(\)/);
    expect(migration).toMatch(/Consent owner required/);
  });

  it('purges both course and anchor outboxes during the cascade', () => {
    expect(migration).toMatch(/DELETE FROM public\.xapi_outbox x[\s\S]*pedagogy_telemetry/);
    expect(migration).toMatch(/DELETE FROM public\.xapi_outbox x[\s\S]*live_sessions/);
  });

  it('does not broaden callable privileges', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*PUBLIC, anon, authenticated/);
    expect(migration).not.toMatch(/GRANT EXECUTE/);
  });
});
