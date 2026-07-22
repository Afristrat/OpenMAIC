'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';

type Transmission = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  error: string | null;
  recipientName: string;
};

export function TransmissionViewer({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const [transmission, setTransmission] = useState<Transmission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/transmissions/${id}`, { cache: 'no-store' });
        const payload = (await response.json()) as {
          transmission?: Transmission;
          message?: string;
          error?: string;
        };
        if (!response.ok || !payload.transmission) {
          throw new Error(payload.message ?? payload.error ?? 'Transmission introuvable');
        }
        if (active) setTransmission(payload.transmission);
      } catch (loadError) {
        if (active)
          setError(loadError instanceof Error ? loadError.message : t('transmission.unavailable'));
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [id, t]);

  const isRtl = locale === 'ar-MA';
  return (
    <main
      className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6 py-12"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold text-primary">Qalem</p>
        <h1 className="text-3xl font-bold tracking-tight">{t('transmission.title')}</h1>
        {transmission && (
          <p className="text-lg text-muted-foreground">
            {t('transmission.deliveredTo', { name: transmission.recipientName })}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 p-4 text-destructive">{error}</p>
      )}
      {!error && !transmission && (
        <p className="text-muted-foreground">{t('transmission.loading')}</p>
      )}
      {transmission?.status === 'queued' && <p>{t('transmission.queued')}</p>}
      {transmission?.status === 'processing' && <p>{t('transmission.processing')}</p>}
      {transmission?.status === 'failed' && (
        <p className="rounded-md border border-destructive/40 p-4 text-destructive">
          {t('transmission.failed')}
        </p>
      )}
      {transmission?.status === 'done' && (
        <video className="w-full rounded-xl border bg-black shadow-lg" controls preload="metadata">
          <source src={`/api/transmissions/${transmission.id}/content`} type="video/mp4" />
          {t('transmission.videoUnsupported')}
        </video>
      )}
    </main>
  );
}
