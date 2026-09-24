import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260923234500_global_credit_policy.sql'),
  'utf8',
);

describe('global credit policy migration (S6-030)', () => {
  it('anchors one credit to one US cent without deriving tenant sell prices', () => {
    expect(migration).toMatch(/anchor_currency TEXT NOT NULL CHECK \(anchor_currency = 'USD'\)/i);
    expect(migration).toMatch(
      /anchor_cost_microunits BIGINT NOT NULL CHECK \(anchor_cost_microunits = 10000\)/i,
    );
    const policy = migration.slice(
      migration.indexOf('CREATE TABLE public.platform_credit_policies'),
      migration.indexOf('CREATE TABLE public.platform_credit_burn_rates'),
    );
    expect(policy).not.toMatch(/tenant_sell_prices|price_microunits/i);
  });

  it('inherits the global version unless an explicit tenant override is active', () => {
    const reservation = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_tenant_usage'),
      migration.indexOf('DROP FUNCTION public.settle_tenant_usage'),
    );
    expect(reservation.indexOf('tenant_credit_burn_rates')).toBeLessThan(
      reservation.indexOf('platform_credit_burn_rates'),
    );
    expect(reservation).toMatch(/GLOBAL_CREDIT_BURN_RATE_NOT_FOUND/i);
    expect(migration).toMatch(/inherit_platform_credit_burn_rate/i);
  });

  it('debits usage before attempting an independent economic valuation', () => {
    const reservation = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_tenant_usage'),
      migration.indexOf('DROP FUNCTION public.settle_tenant_usage'),
    );
    expect(reservation).not.toMatch(
      /tenant_sell_prices|provider_cost_rates|currency_exchange_rates/i,
    );
    const settlement = migration.slice(
      migration.indexOf('CREATE FUNCTION public.settle_tenant_usage'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.release_tenant_usage'),
    );
    expect(settlement).toMatch(/'meter-actual:' \|\| reservation\.operation_key/i);
    expect(settlement).toMatch(/pending_configuration/i);
    expect(settlement).toMatch(/SELL_PRICE_NOT_FOUND/i);
    expect(settlement).toMatch(/PROVIDER_COST_NOT_FOUND/i);
    expect(settlement).toMatch(/EXCHANGE_RATE_NOT_FOUND/i);
  });

  it('initializes active tenants without rewriting their wallet balances', () => {
    expect(migration).toMatch(/initialize_tenant_usage_billing/i);
    expect(migration).toMatch(/INSERT INTO public\.tenant_credit_wallets\(org_id\)/i);
    expect(migration).not.toMatch(/UPDATE public\.tenant_credit_wallets/i);
    expect(migration).toMatch(/activation_source[\s\S]*system/i);
  });

  it('keeps policy tables private and immutable', () => {
    for (const table of ['platform_credit_policies', 'platform_credit_burn_rates']) {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'),
      );
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'i'),
      );
    }
    expect(migration).toMatch(/protect_platform_credit_policy_version/i);
    expect(migration).toMatch(/protect_platform_credit_burn_rate_version/i);
  });
});
