'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';

const UNITS = [
  'llm_input_token',
  'llm_output_token',
  'tts_second',
  'asr_second',
  'image',
  'video_second',
  'storage_byte',
  'operation',
] as const;

type Margin = {
  revenueMicrounits: number;
  costMicrounits: number;
  grossMarginMicrounits: number;
  marginBps: number;
  targetMarginBps: number;
  belowTarget: boolean;
};

type SellPrice = {
  id: string;
  billable_unit: string;
  currency: string;
  price_microunits: number;
  quantity_basis: string;
  commercial_rationale: string;
};

type MarginBreakdown = {
  billableUnit: string;
  revenueMicrounits: number;
  costMicrounits: number;
  grossMarginMicrounits: number;
  marginBps: number;
};

type CreditBurnRate = {
  id: string;
  billable_unit: (typeof UNITS)[number];
  credit_microunits: number;
  quantity_basis: string;
};

type UsageBillingControl = {
  enforcement_enabled: boolean;
  sell_currency: string;
  required_units: Array<(typeof UNITS)[number]>;
};

type CreditPolicy = {
  id: string;
  anchor_currency: 'USD';
  anchor_cost_microunits: number;
  calibration_method: string;
  rationale: string;
  valid_from: string;
};

type PlatformCreditPolicy = {
  policy: CreditPolicy | null;
  burnRates: Array<
    CreditBurnRate & {
      settlement_mode: 'measured_actual' | 'p95_flat_rate';
      observation_window_days: number;
      provenance: string;
    }
  >;
  coverage: { activeTenants: number; coveredTenants: number; pendingValuations: number };
};

function localNow(): string {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function money(microunits: number, locale: string, currency = 'MAD'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    microunits / 1_000_000,
  );
}

function MarginCards({ margin }: { margin: Margin }): React.ReactElement {
  const { locale, t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{t('admin.economics.revenue')}</p>
        <p className="font-semibold">{money(margin.revenueMicrounits, locale)}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{t('admin.economics.cost')}</p>
        <p className="font-semibold">{money(margin.costMicrounits, locale)}</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{t('admin.economics.grossMargin')}</p>
        <p className="font-semibold">{money(margin.grossMarginMicrounits, locale)}</p>
      </div>
      <div
        className={`rounded-lg border p-3 ${margin.belowTarget ? 'border-destructive bg-destructive/5' : ''}`}
      >
        <p className="text-xs text-muted-foreground">{t('admin.economics.marginRate')}</p>
        <p className="font-semibold">
          {(margin.marginBps / 100).toFixed(2)} % / {(margin.targetMarginBps / 100).toFixed(2)} %
        </p>
      </div>
    </div>
  );
}

export function EconomicsCockpit(): React.ReactElement {
  const { t } = useI18n();
  const [margin, setMargin] = useState<Margin | null>(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState('95');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [unit, setUnit] = useState<(typeof UNITS)[number]>('llm_input_token');
  const [currency, setCurrency] = useState('USD');
  const [cost, setCost] = useState('');
  const [costSource, setCostSource] = useState<'actual' | 'estimate'>('actual');
  const [basis, setBasis] = useState('1000000');
  const [provenance, setProvenance] = useState('');
  const [validFrom, setValidFrom] = useState(localNow);
  const [fxBase, setFxBase] = useState('USD');
  const [fxQuote, setFxQuote] = useState('MAD');
  const [fxRate, setFxRate] = useState('');
  const [fxProvenance, setFxProvenance] = useState('');
  const [creditPolicy, setCreditPolicy] = useState<PlatformCreditPolicy | null>(null);
  const [burnUnit, setBurnUnit] = useState<(typeof UNITS)[number]>('llm_input_token');
  const [burnCredits, setBurnCredits] = useState('');
  const [burnBasis, setBurnBasis] = useState('1000000');
  const [settlementMode, setSettlementMode] = useState<'measured_actual' | 'p95_flat_rate'>(
    'measured_actual',
  );
  const [observationWindowDays, setObservationWindowDays] = useState('30');
  const [burnProvenance, setBurnProvenance] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/economics');
      if (!response.ok) throw new Error('economics');
      const body = (await response.json()) as {
        margin: Margin;
        creditPolicy: PlatformCreditPolicy;
      };
      setMargin(body.margin);
      setCreditPolicy(body.creditPolicy);
      setTarget(String(body.margin.targetMarginBps / 100));
    } catch {
      toast.error(t('admin.economics.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (payload: object) => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/economics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('save');
      toast.success(t('admin.economics.saved'));
      await load();
    } catch {
      toast.error(t('admin.economics.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveTarget = (event: FormEvent) => {
    event.preventDefault();
    void save({
      action: 'marginTarget',
      targetMarginBps: Math.round(Number(target) * 100),
      rationale: t('admin.economics.targetRationale'),
    });
  };
  const saveCost = (event: FormEvent) => {
    event.preventDefault();
    void save({
      action: 'providerCost',
      providerId: provider,
      modelId: model,
      billableUnit: unit,
      currency,
      costAmount: cost,
      quantityBasis: basis,
      costSource,
      provenance,
      validFrom: new Date(validFrom).toISOString(),
    });
  };
  const saveFx = (event: FormEvent) => {
    event.preventDefault();
    void save({
      action: 'exchangeRate',
      baseCurrency: fxBase,
      quoteCurrency: fxQuote,
      rate: fxRate,
      provenance: fxProvenance,
      validFrom: new Date(validFrom).toISOString(),
    });
  };
  const saveGlobalBurnRate = (event: FormEvent) => {
    event.preventDefault();
    if (!creditPolicy?.policy) {
      toast.error(t('admin.economics.policyMissing'));
      return;
    }
    void save({
      action: 'globalBurnRate',
      policyId: creditPolicy.policy.id,
      billableUnit: burnUnit,
      creditMicrounits: Math.round(Number(burnCredits) * 1_000_000),
      quantityBasis: Number(burnBasis),
      settlementMode,
      observationWindowDays: Number(observationWindowDays),
      provenance: burnProvenance,
      validFrom: new Date(validFrom).toISOString(),
    });
  };

  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5"
      aria-label={t('admin.economics.title')}
    >
      <div>
        <h3 className="font-semibold">{t('admin.economics.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('admin.economics.valuePricingNotice')}</p>
      </div>
      {margin && (
        <>
          <MarginCards margin={margin} />
          {margin.belowTarget && (
            <p
              role="alert"
              className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm"
            >
              {t('admin.economics.belowTarget')}
            </p>
          )}
        </>
      )}
      {creditPolicy && (
        <section className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{t('admin.economics.globalCreditPolicy')}</p>
            <p className="text-xs text-muted-foreground">
              {creditPolicy.policy
                ? t('admin.economics.creditAnchor', {
                    amount: String(creditPolicy.policy.anchor_cost_microunits / 1_000_000),
                    currency: creditPolicy.policy.anchor_currency,
                  })
                : t('admin.economics.policyMissing')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">{t('admin.economics.coveredTenants')}</span>
              <p className="font-semibold">
                {creditPolicy.coverage.coveredTenants} / {creditPolicy.coverage.activeTenants}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">{t('admin.economics.globalRates')}</span>
              <p className="font-semibold">
                {creditPolicy.burnRates.length} / {UNITS.length}
              </p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">
                {t('admin.economics.pendingValuations')}
              </span>
              <p className="font-semibold">{creditPolicy.coverage.pendingValuations}</p>
            </div>
          </div>
          {creditPolicy.burnRates.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {creditPolicy.burnRates.map((rate) => (
                <li key={rate.id} className="rounded-full border px-3 py-1">
                  {t(`admin.economics.units.${rate.billable_unit}`)} ·{' '}
                  {rate.credit_microunits / 1_000_000} / {rate.quantity_basis} ·{' '}
                  {t(`admin.economics.settlementModes.${rate.settlement_mode}`)}
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={saveGlobalBurnRate}
            className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-6"
          >
            <label className="space-y-1 text-sm">
              <span>{t('admin.economics.unit')}</span>
              <select
                value={burnUnit}
                onChange={(event) => setBurnUnit(event.target.value as (typeof UNITS)[number])}
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                {UNITS.map((value) => (
                  <option key={value} value={value}>
                    {t(`admin.economics.units.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('admin.economics.creditBurn')}</span>
              <input
                required
                inputMode="decimal"
                value={burnCredits}
                onChange={(event) => setBurnCredits(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('admin.economics.basis')}</span>
              <input
                required
                inputMode="decimal"
                value={burnBasis}
                onChange={(event) => setBurnBasis(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('admin.economics.settlementMode')}</span>
              <select
                value={settlementMode}
                onChange={(event) => setSettlementMode(event.target.value as typeof settlementMode)}
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                <option value="measured_actual">
                  {t('admin.economics.settlementModes.measured_actual')}
                </option>
                <option value="p95_flat_rate">
                  {t('admin.economics.settlementModes.p95_flat_rate')}
                </option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('admin.economics.observationWindow')}</span>
              <input
                required
                type="number"
                min="1"
                max="366"
                value={observationWindowDays}
                onChange={(event) => setObservationWindowDays(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <Button type="submit" variant="outline" disabled={saving || !creditPolicy.policy}>
              {t('admin.economics.saveGlobalBurnRate')}
            </Button>
            <label className="space-y-1 text-sm md:col-span-2 xl:col-span-6">
              <span>{t('admin.economics.provenance')}</span>
              <input
                required
                maxLength={1000}
                value={burnProvenance}
                onChange={(event) => setBurnProvenance(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
          </form>
        </section>
      )}
      <form onSubmit={saveTarget} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.target')}</span>
          <input
            required
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="w-28 rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit" variant="outline" disabled={saving}>
          {t('admin.economics.saveTarget')}
        </Button>
      </form>
      <form onSubmit={saveCost} className="space-y-3 rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{t('admin.economics.providerCostTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('admin.economics.providerCostNotice')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.provider')}</span>
            <input
              required
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.model')}</span>
            <input
              required
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.unit')}</span>
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value as (typeof UNITS)[number])}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.economics.units.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.costAndCurrency')}</span>
            <div className="flex">
              <input
                required
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                className="min-w-0 flex-1 rounded-s-md border bg-background px-3 py-2"
              />
              <input
                required
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                className="w-16 rounded-e-md border bg-background px-2 py-2"
              />
            </div>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.basis')}</span>
            <input
              required
              inputMode="decimal"
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.costSource')}</span>
            <select
              value={costSource}
              onChange={(event) => setCostSource(event.target.value as 'actual' | 'estimate')}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              <option value="actual">{t('admin.economics.costSources.actual')}</option>
              <option value="estimate">{t('admin.economics.costSources.estimate')}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.validFrom')}</span>
            <input
              required
              type="datetime-local"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('admin.economics.provenance')}</span>
          <input
            required
            maxLength={1000}
            value={provenance}
            onChange={(event) => setProvenance(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit" variant="outline" disabled={saving}>
          {t('admin.economics.saveCost')}
        </Button>
      </form>
      <form onSubmit={saveFx} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="me-auto">
          <p className="text-sm font-medium">{t('admin.economics.fxTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('admin.economics.fxNotice')}</p>
        </div>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.baseCurrency')}</span>
          <input
            required
            maxLength={3}
            value={fxBase}
            onChange={(event) => setFxBase(event.target.value.toUpperCase())}
            className="w-20 rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.quoteCurrency')}</span>
          <input
            required
            maxLength={3}
            value={fxQuote}
            onChange={(event) => setFxQuote(event.target.value.toUpperCase())}
            className="w-20 rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.fxRate')}</span>
          <input
            required
            inputMode="decimal"
            value={fxRate}
            onChange={(event) => setFxRate(event.target.value)}
            className="w-32 rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="min-w-52 flex-1 space-y-1 text-sm">
          <span>{t('admin.economics.provenance')}</span>
          <input
            required
            value={fxProvenance}
            onChange={(event) => setFxProvenance(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit" variant="outline" disabled={saving}>
          {t('admin.economics.saveFx')}
        </Button>
      </form>
    </section>
  );
}

export function TenantEconomics({ tenantId }: { tenantId: string }): React.ReactElement {
  const { locale, t } = useI18n();
  const [margin, setMargin] = useState<Margin | null>(null);
  const [breakdown, setBreakdown] = useState<MarginBreakdown[]>([]);
  const [prices, setPrices] = useState<SellPrice[]>([]);
  const [unit, setUnit] = useState<(typeof UNITS)[number]>('llm_input_token');
  const [currency, setCurrency] = useState('MAD');
  const [price, setPrice] = useState('');
  const [basis, setBasis] = useState('1000000');
  const [rationale, setRationale] = useState('');
  const [validFrom, setValidFrom] = useState(localNow);
  const [saving, setSaving] = useState(false);
  const [burnRates, setBurnRates] = useState<CreditBurnRate[]>([]);
  const [platformBurnRates, setPlatformBurnRates] = useState<CreditBurnRate[]>([]);
  const [billingControl, setBillingControl] = useState<UsageBillingControl | null>(null);
  const [burnUnit, setBurnUnit] = useState<(typeof UNITS)[number]>('llm_input_token');
  const [burnCredits, setBurnCredits] = useState('');
  const [burnBasis, setBurnBasis] = useState('1000000');
  const [burnRationale, setBurnRationale] = useState('');
  const [burnValidFrom, setBurnValidFrom] = useState(localNow);
  const [requiredUnits, setRequiredUnits] = useState<Array<(typeof UNITS)[number]>>([...UNITS]);

  const load = useCallback(async () => {
    try {
      const [economicsResponse, billingResponse] = await Promise.all([
        fetch(`/api/admin/tenants/${tenantId}/economics`),
        fetch(`/api/admin/tenants/${tenantId}/usage-billing`),
      ]);
      if (!economicsResponse.ok || !billingResponse.ok) throw new Error('economics');
      const body = (await economicsResponse.json()) as {
        margin: Margin;
        breakdown?: MarginBreakdown[];
        sellPrices?: SellPrice[];
      };
      const billing = (await billingResponse.json()) as {
        control: UsageBillingControl | null;
        burnRates?: CreditBurnRate[];
        platformBurnRates?: CreditBurnRate[];
      };
      setMargin(body.margin);
      setBreakdown(body.breakdown ?? []);
      setPrices(body.sellPrices ?? []);
      setBillingControl(billing.control);
      setBurnRates(billing.burnRates ?? []);
      setPlatformBurnRates(billing.platformBurnRates ?? []);
      if (billing.control?.required_units) setRequiredUnits(billing.control.required_units);
    } catch {
      toast.error(t('admin.economics.loadFailed'));
    }
  }, [t, tenantId]);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/economics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          billableUnit: unit,
          currency,
          priceAmount: price,
          quantityBasis: basis,
          validFrom: new Date(validFrom).toISOString(),
          commercialRationale: rationale,
        }),
      });
      if (!response.ok) throw new Error('price');
      setPrice('');
      setRationale('');
      toast.success(t('admin.economics.priceSaved'));
      await load();
    } catch {
      toast.error(t('admin.economics.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const submitBurnRate = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const creditMicrounits = Math.round(Number(burnCredits) * 1_000_000);
      const response = await fetch(`/api/admin/tenants/${tenantId}/usage-billing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'burnRate',
          billableUnit: burnUnit,
          creditMicrounits,
          quantityBasis: Number(burnBasis),
          validFrom: new Date(burnValidFrom).toISOString(),
          rationale: burnRationale,
        }),
      });
      if (!response.ok) throw new Error('burn-rate');
      setBurnCredits('');
      setBurnRationale('');
      toast.success(t('admin.economics.burnRateSaved'));
      await load();
    } catch {
      toast.error(t('admin.economics.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const inheritGlobal = async (billableUnit: (typeof UNITS)[number]) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/usage-billing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'inheritGlobal',
          billableUnit,
          validFrom: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error('inherit-global');
      toast.success(t('admin.economics.globalInheritanceRestored'));
      await load();
    } catch {
      toast.error(t('admin.economics.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleBilling = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/usage-billing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'control',
          enabled: !billingControl?.enforcement_enabled,
          sellCurrency: billingControl?.sell_currency ?? currency,
          requiredUnits,
        }),
      });
      if (!response.ok) throw new Error('billing-control');
      toast.success(t('admin.economics.billingControlSaved'));
      await load();
    } catch {
      toast.error(t('admin.economics.billingCoverageMissing'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">{t('admin.economics.tenantTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('admin.economics.sellPriceNotice')}</p>
      </div>
      {margin && <MarginCards margin={margin} />}
      {breakdown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-muted-foreground">
                <th className="p-2 text-start">{t('admin.economics.unit')}</th>
                <th className="p-2 text-end">{t('admin.economics.revenue')}</th>
                <th className="p-2 text-end">{t('admin.economics.cost')}</th>
                <th className="p-2 text-end">{t('admin.economics.marginRate')}</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((item) => (
                <tr key={item.billableUnit} className="border-t">
                  <td className="p-2">{t(`admin.economics.units.${item.billableUnit}`)}</td>
                  <td className="p-2 text-end">{money(item.revenueMicrounits, locale)}</td>
                  <td className="p-2 text-end">{money(item.costMicrounits, locale)}</td>
                  <td className="p-2 text-end">{(item.marginBps / 100).toFixed(2)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {prices.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {prices.map((item) => (
            <li key={item.id} className="rounded-full border px-3 py-1">
              {t(`admin.economics.units.${item.billable_unit}`)} ·{' '}
              {money(item.price_microunits, locale, item.currency)} / {item.quantity_basis}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.unit')}</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as (typeof UNITS)[number])}
            className="w-full rounded-md border bg-background px-3 py-2"
          >
            {UNITS.map((value) => (
              <option key={value} value={value}>
                {t(`admin.economics.units.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.sellPrice')}</span>
          <div className="flex">
            <input
              required
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="min-w-0 flex-1 rounded-s-md border bg-background px-3 py-2"
            />
            <input
              required
              maxLength={3}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              className="w-16 rounded-e-md border bg-background px-2 py-2"
            />
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.basis')}</span>
          <input
            required
            inputMode="decimal"
            value={basis}
            onChange={(event) => setBasis(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.validFrom')}</span>
          <input
            required
            type="datetime-local"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.economics.rationale')}</span>
          <input
            required
            maxLength={1000}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit" variant="outline" disabled={saving}>
          {t('admin.economics.savePrice')}
        </Button>
      </form>
      <section className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t('admin.economics.creditBurnTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('admin.economics.creditBurnNotice')}</p>
          </div>
          <Button type="button" variant="outline" disabled={saving} onClick={toggleBilling}>
            {billingControl?.enforcement_enabled
              ? t('admin.economics.disableBilling')
              : t('admin.economics.enableBilling')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {UNITS.map((value) => (
            <label key={value} className="flex items-center gap-1 rounded-full border px-2 py-1">
              <input
                type="checkbox"
                checked={requiredUnits.includes(value)}
                onChange={(event) =>
                  setRequiredUnits((current) =>
                    event.target.checked
                      ? [...new Set([...current, value])]
                      : current.filter((unitValue) => unitValue !== value),
                  )
                }
              />
              {t(`admin.economics.units.${value}`)}
            </label>
          ))}
        </div>
        {burnRates.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs">
            {burnRates.map((rate) => (
              <li key={rate.id} className="flex items-center gap-2 rounded-full border px-3 py-1">
                {t(`admin.economics.units.${rate.billable_unit}`)} ·{' '}
                {rate.credit_microunits / 1_000_000} / {rate.quantity_basis}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void inheritGlobal(rate.billable_unit)}
                  className="underline underline-offset-2"
                >
                  {t('admin.economics.restoreGlobal')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {platformBurnRates.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('admin.economics.inheritedGlobalRates')}
            </p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {platformBurnRates
                .filter(
                  (platformRate) =>
                    !burnRates.some(
                      (tenantRate) => tenantRate.billable_unit === platformRate.billable_unit,
                    ),
                )
                .map((rate) => (
                  <li key={rate.id} className="rounded-full border border-dashed px-3 py-1">
                    {t(`admin.economics.units.${rate.billable_unit}`)} ·{' '}
                    {rate.credit_microunits / 1_000_000} / {rate.quantity_basis}
                  </li>
                ))}
            </ul>
          </div>
        )}
        <form
          onSubmit={submitBurnRate}
          className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-6"
        >
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.unit')}</span>
            <select
              value={burnUnit}
              onChange={(event) => setBurnUnit(event.target.value as (typeof UNITS)[number])}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.economics.units.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.creditBurn')}</span>
            <input
              required
              inputMode="decimal"
              value={burnCredits}
              onChange={(event) => setBurnCredits(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.basis')}</span>
            <input
              required
              inputMode="decimal"
              value={burnBasis}
              onChange={(event) => setBurnBasis(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.validFrom')}</span>
            <input
              required
              type="datetime-local"
              value={burnValidFrom}
              onChange={(event) => setBurnValidFrom(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.economics.rationale')}</span>
            <input
              required
              maxLength={1000}
              value={burnRationale}
              onChange={(event) => setBurnRationale(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <Button type="submit" variant="outline" disabled={saving}>
            {t('admin.economics.saveBurnRate')}
          </Button>
        </form>
      </section>
    </div>
  );
}
