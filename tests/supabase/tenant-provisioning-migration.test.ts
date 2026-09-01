import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/00049_tenant_provisioning.sql'),
  'utf8',
);

describe('tenant provisioning migration (S6-022)', () => {
  it('defines active/suspended tenants, positive seat limits and valid invitation roles', () => {
    expect(migration).toMatch(/ADD COLUMN status TEXT NOT NULL DEFAULT 'active'/i);
    expect(migration).toMatch(/CHECK \(status IN \('active', 'suspended'\)\)/i);
    expect(migration).toMatch(/CHECK \(seat_limit > 0\)/i);
    expect(migration).toMatch(/org_invitations_role_check/i);
  });

  it('serializes capacity checks on the tenant and counts active reservations', () => {
    expect(migration).toMatch(/WHERE id = NEW\.org_id\s+FOR UPDATE/i);
    expect(migration).toMatch(/TENANT_SEAT_LIMIT_REACHED/i);
    expect(migration).toMatch(/used_at IS NULL AND expires_at > now\(\)/i);
    expect(migration).toMatch(/BEFORE INSERT ON public\.org_members/i);
    expect(migration).toMatch(/BEFORE INSERT ON public\.org_invitations/i);
  });

  it('swaps an invitation reservation for membership inside the same transaction', () => {
    const claim = migration.slice(migration.indexOf('claim_invitation_for_auth_user'));
    expect(claim.indexOf('UPDATE public.org_invitations SET used_at = now()')).toBeLessThan(
      claim.indexOf('INSERT INTO public.org_members'),
    );
  });

  it('keeps an append-only service-role audit of tenant administration', () => {
    expect(migration).toMatch(/CREATE TABLE public\.tenant_admin_audit/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/CREATE POLICY "Service role only"/i);
    expect(migration).toMatch(/AFTER INSERT OR UPDATE OF status, seat_limit/i);
    expect(migration).toMatch(/AFTER INSERT OR UPDATE OF role OR DELETE ON public\.org_members/i);
  });

  it('exposes provisioning controls to the service role only', () => {
    expect(migration).toMatch(/provision_tenant_with_admin_invitation/i);
    expect(migration).toMatch(/update_tenant_controls/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/i);
  });
});
