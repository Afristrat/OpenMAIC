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

type InstallMode = 'prompt' | 'ios' | null;

export function isIosDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isStandalone(displayModeStandalone: boolean, navigatorStandalone = false): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function PwaInstallBanner(): React.ReactNode {
  const { t } = useI18n();
  const [mode, setMode] = useState<InstallMode>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    if (
      isStandalone(window.matchMedia('(display-mode: standalone)').matches, navigatorStandalone)
    ) {
      return;
    }

    try {
      if (localStorage.getItem(DISMISSED_KEY) === 'true') return;
    } catch {
      // localStorage unavailable
    }

    const handler = (e: Event): void => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setMode('prompt');
    };

    const handleInstalled = (): void => {
      deferredPromptRef.current = null;
      setMode(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', handleInstalled);

    if (isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      setMode('ios');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'dismissed') {
        try {
          localStorage.setItem(DISMISSED_KEY, 'true');
        } catch {
          // localStorage unavailable
        }
      }
    } finally {
      deferredPromptRef.current = null;
      setMode(null);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setMode(null);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // localStorage unavailable
    }
  }, []);

  if (!mode) return null;

  return (
    <div
      data-testid="pwa-install-banner"
      className={cn(
        'fixed top-0 inset-x-0 z-[60] flex items-center justify-between gap-3',
        'bg-purple-600 text-white px-4 py-2.5 text-sm shadow-md',
      )}
      role="region"
      aria-label={t('pwa.banner')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Download className="size-4 shrink-0" />
        <span>{mode === 'ios' ? t('pwa.iosInstructions') : t('pwa.banner')}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {mode === 'prompt' && (
          <button
            onClick={handleInstall}
            className="rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors"
          >
            {t('pwa.install')}
          </button>
        )}
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
