'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'qalem-pwa-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner(): React.ReactNode {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Don't show if previously dismissed
    try {
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
    } catch {
      // localStorage unavailable
    }

    const handler = (e: Event): void => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;

      // Only show on mobile/tablet (< 768px) or non-standalone
      const isMobileOrTablet = window.innerWidth < 768;
      if (isMobileOrTablet) {
        setShow(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === 'accepted') {
      setShow(false);
    }
    deferredPromptRef.current = null;
  }, []);

  const handleDismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!show) return null;

  return (
    <div
      className={cn(
        'fixed top-0 inset-x-0 z-[60] flex items-center justify-between gap-3',
        'bg-purple-600 text-white px-4 py-2.5 text-sm shadow-md',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Download className="size-4 shrink-0" />
        <span className="truncate">{t('pwa.banner')}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstall}
          className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
        >
          {t('pwa.install')}
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-md p-1 hover:bg-white/20 transition-colors"
          aria-label={t('common.cancel')}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
