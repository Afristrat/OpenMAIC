import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261024180000_usage_recording_only.sql'),
  'utf8',
);

function between(start: string, end: string): string {
  const from = migration.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return migration.slice(from, migration.indexOf(end, from));
}

describe('indicateur de tenant interne usage_recording_only', () => {
  it('est désactivé par défaut et exige acteur, date et raison quand il est actif', () => {
    expect(migration).toMatch(/usage_recording_only BOOLEAN NOT NULL DEFAULT false/);
    expect(migration).toMatch(/tenant_billing_controls_recording_only_check/);
    expect(migration).not.toMatch(
      /UPDATE public\.tenant_billing_controls SET\s+usage_recording_only = true/i,
    );
  });

  it('retire le CHECK de portefeuille en échouant s’il est introuvable, et le remplace par le trigger', () => {
    expect(migration).toMatch(/WALLET_BALANCE_CHECK_NOT_FOUND/);
    const trigger = between(
      'FUNCTION public.enforce_credit_wallet_balance',
      'FUNCTION public.post_tenant_credit_entry',
    );
    expect(trigger).toMatch(/CREDIT_WALLET_NEGATIVE_FORBIDDEN/);
    expect(trigger).toMatch(/usage_recording_only/);
    expect(trigger.indexOf('CREDIT_LEDGER_DIVERGENCE')).toBeLessThan(
      trigger.indexOf('CREDIT_WALLET_NEGATIVE_FORBIDDEN'),
    );
  });

  it('n’exempte du refus de solde que le débit d’un tenant marqué, après le verrou du portefeuille', () => {
    const post = between(
      'FUNCTION public.post_tenant_credit_entry',
      'CREATE FUNCTION public.set_tenant',
    );
    expect(post).toMatch(
      /NOT \(credit_entry_type = 'debit' AND COALESCE\(recording_only, false\)\)/,
    );
    expect(post).toMatch(/INSUFFICIENT_TENANT_CREDITS/);
    expect(post).toMatch(/credit_delta_microunits < 0\s+AND NOT \(credit_entry_type = 'debit'/);
    expect(post.indexOf('FOR UPDATE')).toBeLessThan(post.indexOf('usage_recording_only'));
    expect(post.indexOf('CREDIT_LEDGER_DIVERGENCE')).toBeLessThan(
      post.indexOf('usage_recording_only'),
    );
  });

  it('ne redéfinit ni la réservation, ni le règlement, ni la libération, ni la réconciliation', () => {
    expect(migration).not.toMatch(
      /FUNCTION public\.(reserve_tenant_usage|settle_tenant_usage|release_tenant_usage|finalize_tenant_usages|reconcile_tenant_credit_wallet|configure_tenant_billing)/,
    );
  });

  it('trace chaque bascule, verrouille avant d’écrire et refuse l’extinction avec un solde négatif', () => {
    const toggle = migration.slice(
      migration.indexOf('CREATE FUNCTION public.set_tenant_usage_recording_only'),
    );
    expect(toggle).toMatch(/pg_advisory_xact_lock/);
    expect(toggle.indexOf('FOR UPDATE')).toBeLessThan(
      toggle.indexOf('UPDATE public.tenant_billing_controls'),
    );
    expect(toggle).toMatch(/USAGE_RECORDING_ONLY_NEGATIVE_BALANCE/);
    expect(toggle).toMatch(/INSERT INTO public\.tenant_usage_recording_only_events/);
  });

  it('active la RLS et réserve les accès au rôle de service', () => {
    expect(migration).toMatch(/tenant_usage_recording_only_events ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE public\.tenant_usage_recording_only_events TO service_role/,
    );
    expect(migration).not.toMatch(/GRANT ALL ON TABLE public\.tenant_usage_recording_only_events/);
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.tenant_usage_recording_only_events FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_tenant_usage_recording_only\(UUID, UUID, BOOLEAN, TEXT\)\s+TO service_role/,
    );
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.post_tenant_credit_entry/);
  });
});
