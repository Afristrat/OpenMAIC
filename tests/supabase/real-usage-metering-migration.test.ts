import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/00056_real_usage_metering.sql'),
  'utf8',
);

describe('real provider usage metering migration (S6-025)', () => {
  it('keeps credit burn rates independent from sell prices and provider costs', () => {
    const burnRateFunction = migration.slice(
      migration.indexOf('public.create_tenant_credit_burn_rate'),
      migration.indexOf('public.configure_tenant_billing'),
    );
    expect(burnRateFunction).toMatch(/credit_microunits/i);
    expect(burnRateFunction).toMatch(/quantity_basis/i);
    expect(burnRateFunction).not.toMatch(
      /tenant_sell_prices|provider_cost_rates|price_microunits/i,
    );
    expect(migration).toMatch(/CREDIT_BURN_PERIOD_OVERLAP/i);
  });

  it('leaves enforcement disabled until every required unit has explicit coverage', () => {
    expect(migration).toMatch(/enforcement_enabled BOOLEAN NOT NULL DEFAULT false/i);
    const configuration = migration.slice(
      migration.indexOf('public.configure_tenant_billing'),
      migration.indexOf('public.reserve_tenant_usage'),
    );
    expect(configuration).toMatch(/tenant_credit_burn_rates/i);
    expect(configuration).toMatch(/tenant_sell_prices/i);
    expect(configuration).toMatch(/INCOMPLETE_TENANT_BILLING_COVERAGE/i);
    expect(configuration).not.toMatch(/provider_cost_rates/i);
  });

  it('reserves credits before provider work and snapshots every economic version', () => {
    const reservation = migration.slice(
      migration.indexOf('public.reserve_tenant_usage'),
      migration.indexOf('public.settle_tenant_usage'),
    );
    expect(reservation).toMatch(/pg_advisory_xact_lock/i);
    expect(reservation).toMatch(/USAGE_RESERVATION_IDEMPOTENCY_MISMATCH/i);
    expect(reservation).toMatch(/NOT p_idempotency_stable/i);
    expect(reservation).toMatch(/'meter-reserve:' \|\| p_operation_key/i);
    expect(reservation).toMatch(/public\.post_tenant_credit_entry/i);
    expect(reservation).toMatch(
      /burn_rate_id, sell_price_id,[\s\S]*provider_cost_rate_id, exchange_rate_id/i,
    );
    expect(reservation.indexOf('public.post_tenant_credit_entry')).toBeLessThan(
      reservation.indexOf('INSERT INTO public.tenant_usage_reservations'),
    );
  });

  it('refunds the reservation and debits only measured usage in one settlement', () => {
    const settlement = migration.slice(
      migration.indexOf('public.settle_tenant_usage'),
      migration.indexOf('public.release_tenant_usage'),
    );
    const refund = settlement.indexOf("'meter-refund:' || reservation.operation_key");
    const actualDebit = settlement.indexOf("'meter-actual:' || reservation.operation_key");
    expect(refund).toBeGreaterThan(0);
    expect(actualDebit).toBeGreaterThan(refund);
    expect(settlement).toMatch(/p_actual_quantity > reservation\.max_quantity/i);
    expect(settlement).toMatch(/USAGE_SETTLEMENT_IDEMPOTENCY_MISMATCH/i);
    expect(settlement).toMatch(/reservation\.sell_price_id/i);
    expect(settlement).toMatch(/reservation\.provider_cost_rate_id/i);
    expect(settlement).toMatch(/reservation\.exchange_rate_id/i);
    expect(settlement).toMatch(/INSERT INTO public\.valued_billable_usage/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_tenant_usages/i);
    expect(migration).toMatch(/PERFORM \* FROM public\.settle_tenant_usage/i);
    expect(migration).toMatch(/PERFORM \* FROM public\.release_tenant_usage/i);
  });

  it('fully refunds failed or empty provider work without creating valued usage', () => {
    const release = migration.slice(migration.indexOf('public.release_tenant_usage'));
    expect(release).toMatch(/'refund', reservation\.reserved_credit_microunits/i);
    expect(release).toMatch(/status = 'released'/i);
    expect(release).toMatch(/USAGE_RESERVATION_ALREADY_SETTLED/i);
    expect(release).not.toMatch(/INSERT INTO public\.valued_billable_usage/i);
  });

  it('keeps metering tables and RPCs inaccessible to browser roles', () => {
    for (const table of [
      'tenant_billing_controls',
      'tenant_credit_burn_rates',
      'tenant_usage_reservations',
    ]) {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'),
      );
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'i'),
      );
    }
    for (const functionName of [
      'create_tenant_credit_burn_rate',
      'configure_tenant_billing',
      'reserve_tenant_usage',
      'settle_tenant_usage',
      'release_tenant_usage',
      'finalize_tenant_usages',
      'release_tenant_usages',
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
