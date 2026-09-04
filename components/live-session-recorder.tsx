'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, Loader2, Square } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  recordLiveSessionEvent,
  startLiveSession,
  stopLiveSession,
} from '@/lib/live-session/client';
import { useStageStore } from '@/lib/store';

export function LiveSessionRecorder() {
  const { t } = useI18n();
  const stageId = useStageStore((state) => state.stage?.id);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationSessionId, setEvaluationSessionId] = useState<string | null>(null);
  const [useful, setUseful] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [evaluationBusy, setEvaluationBusy] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [anchoringEnabled, setAnchoringEnabled] = useState(false);
  const [anchoringSessionId, setAnchoringSessionId] = useState<string | null>(null);
  const [anchoringBusy, setAnchoringBusy] = useState(false);
  const [anchoringError, setAnchoringError] = useState<string | null>(null);
  const recordingRef = useRef(false);

  useEffect(() => {
    let current = true;
    void fetch('/api/live-sessions/capability')
      .then((response) => response.json())
      .then((body: { enabled?: boolean }) => {
        if (current) setEnabled(body.enabled === true);
      })
      .catch(() => undefined);
    void fetch('/api/anchoring/capability')
      .then((response) => response.json())
      .then((body: { enabled?: boolean }) => {
        if (current) setAnchoringEnabled(body.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      current = false;
      if (recordingRef.current) void stopLiveSession();
    };
  }, []);

  if (!enabled || !stageId) return null;

  const start = async () => {
    if (!consented) return;
    setBusy(true);
    setError(null);
    try {
      await startLiveSession(stageId);
      recordingRef.current = true;
      setRecording(true);
      setOpen(false);
      await recordLiveSessionEvent('system', 'recording_started', { stageId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('replay.recordingFailed'));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordLiveSessionEvent('system', 'recording_stopped', { stageId });
      const completedSessionId = await stopLiveSession();
      recordingRef.current = false;
      setRecording(false);
      setConsented(false);
      setEvaluationSessionId(completedSessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('replay.recordingFailed'));
    } finally {
      setBusy(false);
    }
  };

  const submitEvaluation = async () => {
    if (!evaluationSessionId || !useful || !confidence) return;
    setEvaluationBusy(true);
    setEvaluationError(null);
    try {
      const response = await fetch(
        `/api/live-sessions/${encodeURIComponent(evaluationSessionId)}/evaluations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useful, confidence }),
        },
      );
      if (!response.ok) throw new Error(t('anchoring.hotEvaluationFailed'));
      const completedSessionId = evaluationSessionId;
      setEvaluationSessionId(null);
      setUseful(0);
      setConfidence(0);
      if (anchoringEnabled) setAnchoringSessionId(completedSessionId);
    } catch (cause) {
      setEvaluationError(
        cause instanceof Error ? cause.message : t('anchoring.hotEvaluationFailed'),
      );
    } finally {
      setEvaluationBusy(false);
    }
  };

  const skipEvaluation = () => {
    const completedSessionId = evaluationSessionId;
    setEvaluationSessionId(null);
    setUseful(0);
    setConfidence(0);
    if (anchoringEnabled && completedSessionId) setAnchoringSessionId(completedSessionId);
  };

  const activateAnchoring = async () => {
    if (!anchoringSessionId) return;
    setAnchoringBusy(true);
    setAnchoringError(null);
    try {
      const seedResponse = await fetch(
        `/api/live-sessions/${encodeURIComponent(anchoringSessionId)}/seeds`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      if (!seedResponse.ok) throw new Error(t('anchoring.optInFailed'));
      const planResponse = await fetch(
        `/api/live-sessions/${encodeURIComponent(anchoringSessionId)}/anchor-plan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optedIn: true }),
        },
      );
      if (!planResponse.ok) throw new Error(t('anchoring.optInFailed'));
      setAnchoringSessionId(null);
    } catch (cause) {
      setAnchoringError(cause instanceof Error ? cause.message : t('anchoring.optInFailed'));
    } finally {
      setAnchoringBusy(false);
    }
  };

  const evaluationDialog = (
    <Dialog
      open={evaluationSessionId !== null}
      onOpenChange={(next) => {
        if (!next) skipEvaluation();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('anchoring.hotEvaluationTitle')}</DialogTitle>
          <DialogDescription>{t('anchoring.hotEvaluationDescription')}</DialogDescription>
        </DialogHeader>
        {[
          ['useful', t('anchoring.hotEvaluationUseful'), useful, setUseful],
          ['confidence', t('anchoring.hotEvaluationConfidence'), confidence, setConfidence],
        ].map(([name, label, value, setter]) => (
          <label key={String(name)} className="grid gap-2 text-sm font-medium">
            <span>{String(label)}</span>
            <select
              value={Number(value) || ''}
              onChange={(event) => (setter as (next: number) => void)(Number(event.target.value))}
              className="h-10 rounded-md border bg-background px-3"
              aria-label={String(label)}
            >
              <option value="">{t('anchoring.hotEvaluationChoose')}</option>
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </label>
        ))}
        {evaluationError && <p className="text-sm text-destructive">{evaluationError}</p>}
        <DialogFooter>
          <button
            type="button"
            onClick={skipEvaluation}
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          >
            {t('anchoring.hotEvaluationSkip')}
          </button>
          <button
            type="button"
            onClick={() => void submitEvaluation()}
            disabled={!useful || !confidence || evaluationBusy}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {evaluationBusy && <Loader2 className="me-2 size-4 animate-spin" />}
            {t('anchoring.hotEvaluationSubmit')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const anchoringDialog = (
    <Dialog
      open={anchoringSessionId !== null}
      onOpenChange={(next) => !next && setAnchoringSessionId(null)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('anchoring.optInTitle')}</DialogTitle>
          <DialogDescription>{t('anchoring.optInDescription')}</DialogDescription>
        </DialogHeader>
        {anchoringError && <p className="text-sm text-destructive">{anchoringError}</p>}
        <DialogFooter>
          <button
            type="button"
            onClick={() => setAnchoringSessionId(null)}
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          >
            {t('anchoring.optInDecline')}
          </button>
          <button
            type="button"
            onClick={() => void activateAnchoring()}
            disabled={anchoringBusy}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {anchoringBusy && <Loader2 className="me-2 size-4 animate-spin" />}
            {t('anchoring.optInAccept')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (recording) {
    return (
      <>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          aria-label={t('replay.stopRecording')}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          {t('replay.recording')}
        </button>
        {evaluationDialog}
        {anchoringDialog}
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConsented(false);
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full border border-gray-100/50 bg-white/60 text-gray-400 shadow-sm backdrop-blur-md transition-colors hover:text-red-600 dark:border-gray-700/50 dark:bg-gray-800/60"
            aria-label={t('replay.startRecording')}
          >
            <Circle className="size-4 fill-current" />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('replay.consentTitle')}</DialogTitle>
            <DialogDescription>{t('replay.consentDescription')}</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={consented}
              onCheckedChange={(checked) => setConsented(checked === true)}
              aria-label={t('replay.consentCheckbox')}
            />
            <span>{t('replay.consentCheckbox')}</span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <button
              type="button"
              onClick={() => void start()}
              disabled={!consented || busy}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="me-2 size-4 animate-spin" />}
              {t('replay.confirmRecording')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {evaluationDialog}
      {anchoringDialog}
    </>
  );
}
