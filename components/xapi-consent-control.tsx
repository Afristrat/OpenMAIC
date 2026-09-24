'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';

export function XapiConsentControl(): React.ReactNode {
  const { t } = useI18n();
  const { user, isGuest } = useAuth();
  const [choice, setChoice] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.id || isGuest) return;
    let cancelled = false;
    fetch('/api/telemetry-consent?purpose=xapi', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('xAPI choice unavailable');
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== 'object' ||
          !('choice' in data) ||
          typeof data.choice !== 'boolean'
        ) {
          throw new Error('Invalid xAPI choice');
        }
        if (!cancelled) setChoice(data.choice);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, user?.id]);

  if (!user?.id || isGuest) return null;

  const save = async (consent: boolean) => {
    setLoading(true);
    setError(false);
    setSaved(false);
    try {
      const response = await fetch('/api/telemetry-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent, purpose: 'xapi' }),
        signal: AbortSignal.timeout(10000),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== 'object' ||
        !('ok' in data) ||
        data.ok !== true ||
        !('choice' in data) ||
        data.choice !== consent
      ) {
        throw new Error('xAPI choice not saved');
      }
      setChoice(consent);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      role="region"
      aria-label={t('telemetry.xapiTitle')}
      className="rounded-lg border border-border/40 bg-background/95 px-4 py-4 shadow-lg"
    >
      <p className="text-sm text-foreground">{t('telemetry.xapiBanner')}</p>
      <p className="mt-2 text-sm">
        {t(choice === true ? 'telemetry.xapiEnabled' : 'telemetry.xapiDisabled')}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('telemetry.error')}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-2 text-sm">
          {t('telemetry.saved')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={loading || choice === undefined || choice === true}
          className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          {t('telemetry.xapiAccept')}
        </button>
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={loading || choice === undefined || choice === false}
          className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          {t('telemetry.withdraw')}
        </button>
      </div>
    </section>
  );
}
