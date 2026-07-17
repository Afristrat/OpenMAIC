'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/lib/hooks/use-i18n';

interface GenerationJob {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  result?: { url: string };
}

function GenerationStatus() {
  const { t } = useI18n();
  const router = useRouter();
  const jobId = useSearchParams().get('jobId');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setHasFailed(true);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/generate-classroom/${encodeURIComponent(jobId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error('Generation status unavailable');
        if (cancelled) return;
        setJob(data);
        if (data.status === 'succeeded' && data.result?.url) router.replace(data.result.url);
        if (data.status === 'failed') setHasFailed(true);
      } catch {
        if (!cancelled) setHasFailed(true);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, router]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        {hasFailed ? <AlertCircle className="mx-auto size-12 text-destructive" /> : <Sparkles className="mx-auto size-12 text-primary animate-pulse" />}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{hasFailed ? t('generation.generationFailed') : t('generation.generatingCourse')}</h1>
          <p className="text-sm text-muted-foreground">{hasFailed ? t('generation.generationFailed') : t('generation.aiWorking')}</p>
        </div>
        {!hasFailed && <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${job?.progress ?? 0}%` }} /></div>}
        {hasFailed && <Button onClick={() => router.push('/app')}><ArrowLeft className="mr-2 size-4" />{t('generation.goBackAndRetry')}</Button>}
      </Card>
    </main>
  );
}

export default function GenerationStatusPage() {
  return <Suspense><GenerationStatus /></Suspense>;
}
