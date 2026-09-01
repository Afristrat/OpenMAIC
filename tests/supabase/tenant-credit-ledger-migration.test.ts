import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00053_tenant_credit_ledger.sql'),
  'utf8',
);

describe('tenant credit ledger migration (S6-023)', () => {
  it('keeps wallets and an immutable, idempotent ledger under RLS', () => {
    expect(migration).toMatch(/CREATE TABLE public\.tenant_credit_wallets/i);
    expect(migration).toMatch(/CREATE TABLE public\.tenant_credit_ledger/i);
    expect(migration).toMatch(/UNIQUE \(org_id, idempotency_key\)/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX tenant_credit_ledger_single_refund_idx/i);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/gi);
    expect(migration).toMatch(/Tenant admins read credit wallet/i);
    expect(migration).toMatch(/Tenant admins read credit ledger/i);
    expect(migration).toMatch(/CREDIT_LEDGER_IMMUTABLE/i);
    expect(migration).toMatch(/CREATE TRIGGER enforce_credit_wallet_balance/i);
    expect(migration).toMatch(/NEW\.balance_microunits <> ledger_balance/i);
  });

  it('covers every requested billable unit', () => {
    for (const unit of [
      'llm_input_token',
      'llm_output_token',
      'tts_second',
      'asr_second',
      'image',
      'video_second',
      'storage_byte',
      'operation',
    ]) {
      expect(migration).toContain(`'${unit}'`);
    }
  });

  it('serializes the wallet before checking idempotence and balance', () => {
    const walletLock = migration.indexOf('FOR UPDATE;');
    const idempotencyLookup = migration.indexOf('WHERE tenant_credit_ledger.org_id = tenant_id');
    const balanceCheck = migration.indexOf('CREDIT_LEDGER_DIVERGENCE');
    const walletUpdate = migration.indexOf('UPDATE public.tenant_credit_wallets');
    expect(walletLock).toBeGreaterThan(0);
    expect(walletLock).toBeLessThan(idempotencyLookup);
    expect(idempotencyLookup).toBeLessThan(balanceCheck);
    expect(balanceCheck).toBeLessThan(walletUpdate);
    expect(migration).toMatch(/INSUFFICIENT_TENANT_CREDITS/i);
    expect(migration).toMatch(/CREDIT_IDEMPOTENCY_MISMATCH/i);
  });

  it('fails closed on divergence and exposes a read-only reconciliation', () => {
    expect(migration).toMatch(/sum\(delta_microunits\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.reconcile_tenant_credit_wallet/i);
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/i);
    expect(migration).toMatch(/REVOKE ALL[\s\S]+FROM PUBLIC, anon, authenticated/i);
  });

  it('requires exact refunds and deterministic quantities', () => {
    expect(migration).toMatch(/credit_delta_microunits <> -target_debit\.delta_microunits/i);
    expect(migration).toMatch(/usage_quantity <> round\(usage_quantity, 6\)/i);
    expect(migration).toMatch(/reversal_of IS NOT NULL/i);
  });
});
