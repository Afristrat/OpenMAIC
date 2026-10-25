'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GenerationTracker } from '@/components/generation/generation-tracker';
import { GenerationVoiceNotice } from '@/components/generation/generation-voice-notice';
import { readVoiceWarning, shouldAutoOpenCourse } from '@/lib/generation/voice-warning';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useLiveVoiceState } from '@/lib/hooks/use-live-voice-state';
import { CreditStatusNotice } from '@/components/billing/credit-status-notice';
import { useCreditStatus } from '@/lib/hooks/use-credit-status';
import type { GenerationFailure } from '@/lib/generation/generation-tracking';

interface GenerationJob {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  step?: string;
  progress: number;
  scenesGenerated?: number;
  totalScenes?: number;
  result?: { url: string; classroomId?: string };
  warnings?: unknown;
  failureCode?: 'MEDIA_PROVIDER_UNAVAILABLE';
  failure?: GenerationFailure;
  error?: string;
  startedAt?: string;
  updatedAt?: string;
  serverNow?: string;
  typicalDuration?: { lowMs: number; highMs: number };
}

function GenerationStatus() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const planJobId = searchParams.get('planJobId');
  const orgId = searchParams.get('orgId');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const {
    status: creditStatus,
    refreshing: creditRefreshing,
    refresh: refreshCredits,
  } = useCreditStatus(orgId ?? undefined);
  const failedForCredits = job?.failure?.code === 'INSUFFICIENT_CREDITS';
  const voiceWarning = job?.status === 'succeeded' ? readVoiceWarning(job.warnings) : null;
  // The warning is a snapshot of the generation: the saved course tells what is silent now.
  const liveVoice = useLiveVoiceState(job?.result?.classroomId, Boolean(voiceWarning));

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
        if (shouldAutoOpenCourse(data)) router.replace(data.result.url);
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

  const failureText = job?.failure
    ? t(`generation.failure.${job.failure.code}`, job.failure.params)
    : job?.failureCode === 'MEDIA_PROVIDER_UNAVAILABLE'
      ? t('generation.mediaProviderUnavailable')
      : t('generation.generationFailed');

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        {hasFailed ? (
          <AlertCircle className="mx-auto size-12 text-destructive" />
        ) : voiceWarning ? (
          <CheckCircle2 className="mx-auto size-12 text-primary" />
        ) : (
          <Sparkles className="mx-auto size-12 text-primary animate-pulse" />
        )}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            {hasFailed
              ? t('generation.generationFailed')
              : voiceWarning
                ? t('generation.courseReadyWithWarnings')
                : t('generation.generatingCourse')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasFailed
              ? failureText
              : voiceWarning
                ? liveVoice.kind === 'voiced'
                  ? t('generation.courseReadyAllVoices')
                  : t('generation.courseReadyWithWarningsDesc')
                : t('generation.aiWorking')}
          </p>
          {hasFailed && job?.error && !job.failure && (
            <p className="text-xs text-destructive">{job.error}</p>
          )}
        </div>
        {voiceWarning && job?.result?.url && (
          <>
            <GenerationVoiceNotice state={liveVoice} />
            <Button onClick={() => router.push(job.result?.url ?? '/app')}>
              {t('generation.openCourse')}
            </Button>
          </>
        )}
        {hasFailed && failedForCredits && (
          <CreditStatusNotice
            status={creditStatus}
            rechecking={creditRefreshing}
            onRecheck={() => void refreshCredits()}
          />
        )}
        {!hasFailed && job && (job.status === 'queued' || job.status === 'running') && (
          <GenerationTracker
            kind="course"
            status={job.status}
            step={job.step}
            startedAt={job.startedAt}
            updatedAt={job.updatedAt}
            serverNow={job.serverNow}
            typicalDuration={job.typicalDuration}
            scenes={{ done: job.scenesGenerated ?? 0, total: job.totalScenes }}
            progress={job.progress}
          />
        )}
        {hasFailed && planJobId ? (
          <Button
            onClick={() => {
              const params = new URLSearchParams({ planJobId });
              if (orgId) params.set('orgId', orgId);
              router.push(`/app?${params.toString()}`);
            }}
          >
            <ArrowLeft className="me-2 size-4 rtl-flip" />
            {failedForCredits
              ? t('generation.resumeAfterRecharge')
              : t('generation.resumeApprovedPlan')}
          </Button>
        ) : hasFailed ? (
          <Button onClick={() => router.push('/app')}>
            <ArrowLeft className="me-2 size-4 rtl-flip" />
            {t('generation.goBackAndRetry')}
          </Button>
        ) : null}
      </Card>
    </main>
  );
}

export default function GenerationStatusPage() {
  return (
    <Suspense>
      <GenerationStatus />
    </Suspense>
  );
}
