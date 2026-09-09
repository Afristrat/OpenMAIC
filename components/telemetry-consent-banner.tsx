'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils';

export function TelemetryConsentBanner({ inline = false }: { inline?: boolean }): React.ReactNode {
  const { user, isGuest } = useAuth();
  if (!user || isGuest) return null;
  // Remount on account change: neither a choice nor an in-flight acknowledgement crosses accounts.
  return <ConsentControl key={user.id} inline={inline} />;
}

function ConsentControl({ inline }: { inline: boolean }): React.ReactNode {
  const { t } = useI18n();
  const [choice, setChoice] = useState<boolean | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/telemetry-consent', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      .then(async (res) => {
        if (!res.ok) throw new Error('Consent unavailable');
        const data = await res.json();
        if (data.choice !== null && typeof data.choice !== 'boolean')
          throw new Error('Invalid choice');
        if (!cancelled) setChoice(data.choice);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConsent = async (consent: boolean) => {
    setLoading(true);
    setError(false);
    setSaved(false);
    try {
      const response = await fetch('/api/telemetry-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Consent not saved');
      const data = await response.json();
      if (data.ok !== true || data.choice !== consent) throw new Error('Invalid acknowledgement');
      setChoice(consent);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (!inline && !error && choice !== null) return null;

  return (
    <div
      role="region"
      aria-label={t('telemetry.title')}
      className={cn(
        inline
          ? 'rounded-lg border border-border/40'
          : 'fixed bottom-0 inset-x-0 z-[60] border-t border-border/40',
        'bg-background/95 backdrop-blur-sm shadow-lg px-4 py-4 sm:px-6',
      )}
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-foreground">{t('telemetry.banner')}</p>
        {inline && (
          <p className="mt-2 text-sm">
            {t(
              choice === true
                ? 'telemetry.enabled'
                : choice === false
                  ? 'telemetry.disabled'
                  : 'telemetry.undecided',
            )}
          </p>
        )}
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

        {expanded && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p>{t('telemetry.detail1')}</p>
            <p>{t('telemetry.detail2')}</p>
            <p>{t('telemetry.detail3')}</p>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleConsent(true)}
            disabled={loading || (choice === undefined && !error)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t('telemetry.accept')}
          </button>
          <button
            onClick={() => handleConsent(false)}
            disabled={loading || (choice === undefined && !error)}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t(choice === true ? 'telemetry.withdraw' : 'telemetry.refuse')}
          </button>
          <button
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={expanded}
            className="text-sm text-primary hover:underline"
          >
            {expanded ? t('telemetry.hidDetails') : t('telemetry.learnMore')}
          </button>
        </div>
      </div>
    </div>
  );
}
