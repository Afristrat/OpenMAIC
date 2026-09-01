import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00055_value_pricing_and_margin.sql'),
  'utf8',
);

describe('value pricing and margin migration (S6-024)', () => {
  it('stores explicit sell prices separately from provider costs', () => {
    expect(migration).toMatch(/CREATE TABLE public\.tenant_sell_prices/i);
    expect(migration).toMatch(/commercial_rationale TEXT NOT NULL/i);
    expect(migration).toMatch(/CREATE TABLE public\.provider_cost_rates/i);
    const sellPriceFunction = migration.slice(
      migration.indexOf('public.create_tenant_sell_price'),
      migration.indexOf('public.create_provider_cost_rate'),
    );
    expect(sellPriceFunction).not.toMatch(/provider_cost|cost_microunits|target_margin/i);
  });

  it('versions prices, costs and audited FX rates without overlapping periods', () => {
    expect(migration).toMatch(/SELL_PRICE_PERIOD_OVERLAP/i);
    expect(migration).toMatch(/PROVIDER_COST_PERIOD_OVERLAP/i);
    expect(migration).toMatch(/EXCHANGE_RATE_PERIOD_OVERLAP/i);
    expect(migration.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toMatch(
      /CREATE TABLE public\.currency_exchange_rates[\s\S]*provenance TEXT NOT NULL/i,
    );
  });

  it('snapshots immutable valuation versions and defaults the target to 95 percent', () => {
    expect(migration).toMatch(/CREATE TABLE public\.valued_billable_usage/i);
    expect(migration).toMatch(/sell_price_id UUID NOT NULL/i);
    expect(migration).toMatch(/provider_cost_rate_id UUID NOT NULL/i);
    expect(migration).toMatch(/exchange_rate_id UUID/i);
    expect(migration).toMatch(/VALUES \(9500, 'Cible Qalem initiale'\)/i);
    expect(migration).toMatch(/ECONOMIC_SNAPSHOT_IMMUTABLE/i);
  });

  it('posts the credit debit and economic valuation in one transaction', () => {
    const atomicDebit = migration.slice(migration.indexOf('public.debit_and_value_tenant_usage'));
    expect(atomicDebit).toMatch(/public\.post_tenant_credit_entry/i);
    expect(atomicDebit).toMatch(/public\.value_tenant_credit_usage/i);
    expect(atomicDebit).toMatch(/p_credit_microunits <= 0/i);
  });

  it('computes a revenue-weighted margin and only reports a target alert', () => {
    const summary = migration.slice(migration.indexOf('public.platform_margin_summary'));
    expect(summary).toMatch(/sum\(revenue_microunits\)/i);
    expect(summary).toMatch(/sum\(cost_microunits\)/i);
    expect(summary).toMatch(/revenue > 0 AND margin < target/i);
    expect(summary).not.toMatch(/UPDATE public\.tenant_sell_prices/i);
    expect(summary).not.toMatch(/UPDATE public\.tenant_credit/i);
  });

  it('reports tenant economics by billable usage over an explicit period', () => {
    const breakdown = migration.slice(migration.indexOf('public.tenant_margin_breakdown'));
    expect(breakdown).toMatch(/GROUP BY usage\.billable_unit/i);
    expect(breakdown).toMatch(/usage\.valued_at >= p_from AND usage\.valued_at < p_to/i);
  });

  it('keeps every economic RPC inaccessible to browser roles', () => {
    for (const functionName of [
      'create_tenant_sell_price',
      'create_provider_cost_rate',
      'create_currency_exchange_rate',
      'set_margin_target',
      'value_tenant_credit_usage',
      'debit_and_value_tenant_usage',
      'tenant_margin_breakdown',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${functionName}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated`,
          'i',
        ),
      );
    }
  });
});
