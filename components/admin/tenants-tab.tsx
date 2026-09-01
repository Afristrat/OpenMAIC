'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { EconomicsCockpit, TenantEconomics } from '@/components/admin/economics-panel';

type Tenant = {
  id: string;
  name: string;
  sector: string;
  default_locale: string;
  status: 'active' | 'suspended';
  seat_limit: number;
  memberCount: number;
  pendingInvitationCount: number;
  creditBalanceMicrounits: number;
};

function TenantCredits({
  tenant,
  disabled,
  onSaved,
}: {
  tenant: Tenant;
  disabled: boolean;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const { locale, t } = useI18n();
  const [entryType, setEntryType] = useState<'allocation' | 'correction'>('allocation');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}/credits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entryType,
          amountCredits: Number(amount),
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error('credit-entry');
      setAmount('');
      setReason('');
      toast.success(t('admin.tenants.credits.updated'));
      await onSaved();
    } catch {
      toast.error(t('admin.tenants.credits.updateFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const balance = (tenant.creditBalanceMicrounits ?? 0) / 1_000_000;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">
        {t('admin.tenants.credits.balance')}:{' '}
        {new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(balance)}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>{t('admin.tenants.credits.operation')}</span>
          <select
            value={entryType}
            onChange={(event) => setEntryType(event.target.value as 'allocation' | 'correction')}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value="allocation">{t('admin.tenants.credits.allocation')}</option>
            <option value="correction">{t('admin.tenants.credits.correction')}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{t('admin.tenants.credits.amount')}</span>
          <input
            required
            type="number"
            step="0.000001"
            min={entryType === 'allocation' ? '0.000001' : '-1000000'}
            max="1000000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-36 rounded-md border bg-background px-3 py-2"
          />
        </label>
        <label className="min-w-56 flex-1 space-y-1 text-sm">
          <span>{t('admin.tenants.credits.reason')}</span>
          <input
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2"
          />
        </label>
        <Button type="submit" disabled={disabled || submitting}>
          {t('admin.tenants.credits.apply')}
        </Button>
      </div>
    </form>
  );
}

export function TenantsTab(): React.ReactElement {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('education');
  const [defaultLocale, setDefaultLocale] = useState('fr-FR');
  const [seatLimit, setSeatLimit] = useState(1);
  const [administratorEmail, setAdministratorEmail] = useState('');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tenants');
      if (!response.ok) throw new Error('tenant-list');
      const body = (await response.json()) as { tenants?: Tenant[] };
      setTenants(body.tenants ?? []);
    } catch {
      toast.error(t('admin.tenants.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  const createTenant = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setInvitationUrl(null);
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, sector, defaultLocale, seatLimit, administratorEmail }),
      });
      const body = (await response.json()) as { administratorInvitationUrl?: string };
      if (!response.ok || !body.administratorInvitationUrl) throw new Error('tenant-create');
      setInvitationUrl(body.administratorInvitationUrl);
      setName('');
      setAdministratorEmail('');
      toast.success(t('admin.tenants.created'));
      await loadTenants();
    } catch {
      toast.error(t('admin.tenants.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateTenant = async (
    tenantId: string,
    controls: { status?: Tenant['status']; seatLimit?: number },
  ) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(controls),
      });
      if (!response.ok) throw new Error('tenant-update');
      toast.success(t('admin.tenants.updated'));
      await loadTenants();
    } catch {
      toast.error(t('admin.tenants.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="auto">
      <EconomicsCockpit />
      <form onSubmit={createTenant} className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold">{t('admin.tenants.createTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('admin.tenants.createHint')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span>{t('admin.tenants.name')}</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.tenants.sector')}</span>
            <select
              value={sector}
              onChange={(event) => setSector(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              {['education', 'healthcare', 'legal', 'tech', 'finance', 'industry'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.tenants.locale')}</span>
            <select
              value={defaultLocale}
              onChange={(event) => setDefaultLocale(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            >
              <option value="fr-FR">Français</option>
              <option value="ar-MA">العربية</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.tenants.seatLimit')}</span>
            <input
              required
              type="number"
              min={1}
              value={seatLimit}
              onChange={(event) => setSeatLimit(Number(event.target.value))}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('admin.tenants.adminEmail')}</span>
            <input
              required
              type="email"
              value={administratorEmail}
              onChange={(event) => setAdministratorEmail(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
        </div>
        <Button type="submit" disabled={saving}>
          {t('admin.tenants.create')}
        </Button>
        {invitationUrl && (
          <label className="block space-y-1 text-sm">
            <span>{t('admin.tenants.invitationUrl')}</span>
            <input
              readOnly
              value={invitationUrl}
              className="w-full rounded-md border bg-muted px-3 py-2 font-mono text-xs"
            />
          </label>
        )}
      </form>

      <section className="space-y-3" aria-label={t('admin.tenants.list')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : tenants.length === 0 ? (
          <p className="rounded-xl border p-5 text-sm text-muted-foreground">
            {t('admin.tenants.empty')}
          </p>
        ) : (
          tenants.map((tenant) => {
            const occupied = tenant.memberCount + tenant.pendingInvitationCount;
            return (
              <article key={tenant.id} className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{tenant.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('admin.tenants.occupancy')}: {occupied}/{tenant.seat_limit}
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs">
                    {t(`admin.tenants.status.${tenant.status}`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="space-y-1 text-sm">
                    <span>{t('admin.tenants.seatLimit')}</span>
                    <input
                      type="number"
                      min={occupied || 1}
                      defaultValue={tenant.seat_limit}
                      className="w-28 rounded-md border bg-background px-3 py-2"
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (next !== tenant.seat_limit) {
                          void updateTenant(tenant.id, { seatLimit: next });
                        }
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() =>
                      void updateTenant(tenant.id, {
                        status: tenant.status === 'active' ? 'suspended' : 'active',
                      })
                    }
                  >
                    {tenant.status === 'active'
                      ? t('admin.tenants.suspend')
                      : t('admin.tenants.activate')}
                  </Button>
                </div>
                <TenantCredits tenant={tenant} disabled={saving} onSaved={loadTenants} />
                <TenantEconomics tenantId={tenant.id} />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
