import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateCreditGate,
  fetchCreditStatus,
  minimumRequiredMicrounits,
  assertCreditsAvailable,
  type CreditRates,
} from '@/lib/billing/credit-preflight';
import { INSUFFICIENT_CREDITS_CODE } from '@/lib/billing/insufficient-credits';
import {
  DEFAULT_METERED_MAX_OUTPUT_TOKENS,
  INPUT_TOKEN_ESTIMATE_SLACK,
} from '@/lib/billing/llm-reservation';

const platformRates: CreditRates = {
  llm_input_token: { credit_microunits: 95, quantity_basis: 1 },
  llm_output_token: { credit_microunits: 400, quantity_basis: 1 },
};

const tables = vi.hoisted(() => ({
  state: {
    control: { enforcement_enabled: true } as Record<string, unknown> | null,
    tenantRates: [] as Array<Record<string, unknown>>,
    platformRates: [] as Array<Record<string, unknown>>,
    balance: 5_000_000 as number | string,
    consistent: true,
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      const rows = () =>
        table === 'tenant_billing_controls'
          ? { data: tables.state.control, error: null }
          : table === 'tenant_credit_burn_rates'
            ? { data: tables.state.tenantRates, error: null }
            : { data: tables.state.platformRates, error: null };
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.lte = () => chain;
      chain.order = () => chain;
      chain.maybeSingle = () => Promise.resolve(rows());
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
      return chain;
    },
    rpc: () => ({
      single: () =>
        Promise.resolve({
          data: {
            balance_microunits: tables.state.balance,
            ledger_balance_microunits: tables.state.balance,
            consistent: tables.state.consistent,
          },
          error: null,
        }),
    }),
  }),
}));

describe('pré-contrôle du solde', () => {
  beforeEach(() => {
    tables.state.control = { enforcement_enabled: true };
    tables.state.tenantRates = [];
    tables.state.platformRates = [
      { billable_unit: 'llm_input_token', credit_microunits: 95, quantity_basis: 1 },
      { billable_unit: 'llm_output_token', credit_microunits: 400, quantity_basis: 1 },
    ];
    tables.state.balance = 5_000_000;
    tables.state.consistent = true;
  });

  it("le besoin minimal est la réservation d'un appel LLM à vide, calculée sur les taux en vigueur", () => {
    expect(minimumRequiredMicrounits(platformRates)).toBe(
      INPUT_TOKEN_ESTIMATE_SLACK * 95 + DEFAULT_METERED_MAX_OUTPUT_TOKENS * 400,
    );
  });

  it("sans taux, aucun besoin n'est inventé", () => {
    expect(minimumRequiredMicrounits({})).toBeNull();
    expect(
      minimumRequiredMicrounits({ llm_input_token: platformRates.llm_input_token }),
    ).toBeNull();
  });

  it('bloque sous le besoin minimal quand le blocage est actif', () => {
    const gate = evaluateCreditGate({
      balanceMicrounits: 1_000_000,
      minimumRequiredMicrounits: 7_000_000,
      enforcementEnabled: true,
      recordingOnly: false,
      lowBalanceThresholdMicrounits: 14_000_000,
    });
    expect(gate).toEqual({ blocked: true, lowBalance: true });
  });

  it('ne bloque jamais quand le blocage est désactivé ou le tenant est interne', () => {
    for (const flags of [
      { enforcementEnabled: false, recordingOnly: false },
      { enforcementEnabled: true, recordingOnly: true },
    ]) {
      expect(
        evaluateCreditGate({
          balanceMicrounits: 0,
          minimumRequiredMicrounits: 7_000_000,
          lowBalanceThresholdMicrounits: 14_000_000,
          ...flags,
        }),
      ).toEqual({ blocked: false, lowBalance: false });
    }
  });

  it("n'alerte pas et ne bloque pas au-dessus du seuil", () => {
    expect(
      evaluateCreditGate({
        balanceMicrounits: 20_000_000,
        minimumRequiredMicrounits: 7_000_000,
        enforcementEnabled: true,
        recordingOnly: false,
        lowBalanceThresholdMicrounits: 14_000_000,
      }),
    ).toEqual({ blocked: false, lowBalance: false });
  });

  it('un solde entre le besoin minimal et le seuil alerte sans bloquer', () => {
    expect(
      evaluateCreditGate({
        balanceMicrounits: 10_000_000,
        minimumRequiredMicrounits: 7_000_000,
        enforcementEnabled: true,
        recordingOnly: false,
        lowBalanceThresholdMicrounits: 14_000_000,
      }),
    ).toEqual({ blocked: false, lowBalance: true });
  });

  it('lit le solde, les taux et le seuil configurable en crédits', async () => {
    vi.stubEnv('CREDITS_LOW_BALANCE_THRESHOLD', '9');
    const status = await fetchCreditStatus('org-1');
    expect(status.balanceMicrounits).toBe(5_000_000);
    expect(status.lowBalanceThresholdMicrounits).toBe(9_000_000);
    expect(status.minimumRequiredMicrounits).toBe(
      INPUT_TOKEN_ESTIMATE_SLACK * 95 + DEFAULT_METERED_MAX_OUTPUT_TOKENS * 400,
    );
    expect(status.blocked).toBe(true);
    vi.unstubAllEnvs();
  });

  it('le taux du tenant l’emporte sur le taux plateforme', async () => {
    tables.state.tenantRates = [
      { billable_unit: 'llm_input_token', credit_microunits: 1, quantity_basis: 1 },
      { billable_unit: 'llm_output_token', credit_microunits: 1, quantity_basis: 1 },
    ];
    const status = await fetchCreditStatus('org-1');
    expect(status.minimumRequiredMicrounits).toBe(
      INPUT_TOKEN_ESTIMATE_SLACK + DEFAULT_METERED_MAX_OUTPUT_TOKENS,
    );
    expect(status.blocked).toBe(false);
  });

  it('une colonne usage_recording_only vraie lève le blocage', async () => {
    tables.state.control = { enforcement_enabled: true, usage_recording_only: true };
    tables.state.balance = 0;
    expect((await fetchCreditStatus('org-1')).blocked).toBe(false);
  });

  it('assertCreditsAvailable lève le code stable avec le solde et le besoin', async () => {
    await expect(assertCreditsAvailable('org-1')).rejects.toMatchObject({
      code: INSUFFICIENT_CREDITS_CODE,
    });
    tables.state.balance = 50_000_000;
    await expect(assertCreditsAvailable('org-1')).resolves.toMatchObject({ blocked: false });
  });

  it('refuse un grand livre divergent plutôt que de deviner un solde', async () => {
    tables.state.consistent = false;
    await expect(fetchCreditStatus('org-1')).rejects.toThrow(/divergence/i);
  });
});
