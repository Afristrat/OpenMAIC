'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { cn } from '@/lib/utils';

const CONSENT_DISMISSED_KEY = 'qalem-telemetry-dismissed';

export function TelemetryConsentBanner(): React.ReactNode {
  const { t } = useI18n();
  const { user, isGuest } = useAuth();
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!user && !isGuest;

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Check localStorage first for quick dismiss
    try {
      if (localStorage.getItem(CONSENT_DISMISSED_KEY) === 'true') return;
    } catch {
      // localStorage unavailable
    }

    // Check server-side consent
    let cancelled = false;
    fetch(`/api/telemetry-consent?userId=${encodeURIComponent(user.id)}`)
      .then((res) => res.json())
      .then((data: { hasConsent: boolean }) => {
        if (!cancelled && !data.hasConsent) {
          setShow(true);
        }
      })
      .catch(() => {
        // If check fails, don't show banner (fail silent)
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user]);

  const handleConsent = useCallback(
    async (consent: boolean) => {
      if (!user) return;
      setLoading(true);

      try {
        await fetch('/api/telemetry-consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, consent }),
        });
      } catch {
        // Fail silently — store dismissal in localStorage as fallback
      }

      try {
        localStorage.setItem(CONSENT_DISMISSED_KEY, 'true');
      } catch {
        // localStorage unavailable
      }

      setShow(false);
      setLoading(false);
    },
    [user],
  );

  if (!show) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 z-[60] border-t border-border/40',
        'bg-background/95 backdrop-blur-sm shadow-lg px-4 py-4 sm:px-6',
      )}
    >
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-foreground">{t('telemetry.banner')}</p>

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
            disabled={loading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {t('telemetry.accept')}
          </button>
          <button
            onClick={() => handleConsent(false)}
            disabled={loading}
            className="rounded-lg bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            {t('telemetry.refuse')}
          </button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-sm text-primary hover:underline"
          >
            {expanded ? t('telemetry.hidDetails') : t('telemetry.learnMore')}
          </button>
        </div>
      </div>
    </div>
  );
}
