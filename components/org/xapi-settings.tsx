'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';

export function OrganizationXapiSettings({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const [endpoint, setEndpoint] = useState('');
  const [auth, setAuth] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetch(`/api/organizations/${encodeURIComponent(orgId)}/xapi`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as {
          configured: boolean;
          config: { endpoint: string; enabled: boolean } | null;
        };
      })
      .then((body) => {
        setConfigured(body.configured);
        setEndpoint(body.config?.endpoint ?? '');
        setEnabled(body.config?.enabled ?? false);
      })
      .catch(() => setError(true));
  }, [orgId]);

  const save = async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/xapi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, auth, enabled }),
      });
      if (!response.ok) throw new Error();
      setConfigured(true);
      setAuth('');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/xapi`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error();
      setConfigured(false);
      setEndpoint('');
      setAuth('');
      setEnabled(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-10 rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold">{t('org.xapiTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('org.xapiDescription')}</p>
      <div className="mt-4 grid max-w-2xl gap-4">
        <label className="grid gap-2 text-sm font-medium">
          {t('org.xapiEndpoint')}
          <Input
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            type="url"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {t('org.xapiAuthorization')}
          <Input
            value={auth}
            onChange={(event) => setAuth(event.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder={configured ? t('org.xapiReplaceSecret') : ''}
          />
        </label>
        <label className="flex items-center gap-3 text-sm font-medium">
          <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
          {t('org.xapiEnable')}
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('org.xapiFailed')}
          </p>
        )}
        <div className="flex gap-3">
          <Button onClick={() => void save()} disabled={busy || !endpoint || !auth}>
            {t('org.xapiSave')}
          </Button>
          {configured && (
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              {t('org.xapiDelete')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
