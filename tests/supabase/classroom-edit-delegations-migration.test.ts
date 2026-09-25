import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260925120000_classroom_edit_delegations.sql'),
  'utf8',
);

describe('classroom edit delegations migration (S6-032)', () => {
  it('binds every delegation to one classroom, tenant and trainer', () => {
    expect(migration).toMatch(/FOREIGN KEY \(stage_id, org_id\)[\s\S]*stages\(id, org_id\)/i);
    expect(migration).toMatch(/requester_id UUID NOT NULL REFERENCES public\.profiles/i);
    expect(migration).toMatch(/one_pending[\s\S]*stage_id, requester_id/i);
  });

  it('limits decisions to active tenant administrators or managers', () => {
    expect(migration).toMatch(/decision_role NOT IN \('admin', 'manager'\)/i);
    expect(migration).toMatch(/decision_tenant_status IS DISTINCT FROM 'active'/i);
    expect(migration).toMatch(/requester_role IS DISTINCT FROM 'formateur'/i);
  });

  it('enforces an expiring grant of at most thirty days', () => {
    expect(migration).toMatch(/expires_at <= NEW\.decided_at/i);
    expect(migration).toMatch(/expires_at > NEW\.decided_at \+ INTERVAL '30 days'/i);
    expect(migration).toMatch(/approved[\s\S]*expires_at IS NOT NULL/i);
  });

  it('keeps the table server-only behind RLS', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL[\s\S]*TO service_role/i);
  });
});
