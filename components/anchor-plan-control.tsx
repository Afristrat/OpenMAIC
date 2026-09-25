'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface Plan {
  id: string;
  opted_in_at: string;
  ends_at: string;
  paused: boolean;
}

export function AnchorPlanControl({
  planId,
  deliveryId,
  evaluationPhase,
}: {
  planId: string;
  deliveryId: string | null;
  evaluationPhase: 'cold_30' | 'cold_60' | null;
}) {
  const { t } = useI18n();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [relevance, setRelevance] = useState(0);
  const [returnIntent, setReturnIntent] = useState(0);
  const [application, setApplication] = useState(0);
  const [evaluationSent, setEvaluationSent] = useState(false);

  useEffect(() => {
    void fetch(`/api/anchor-plans/${encodeURIComponent(planId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { plan: Plan };
      })
      .then((body) => setPlan(body.plan))
      .catch(() => setError(true));
  }, [planId]);

  const submitEvaluation = async () => {
    if (!deliveryId || !evaluationPhase || !relevance || !returnIntent || !application) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/anchor-deliveries/${encodeURIComponent(deliveryId)}/evaluation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relevance, returnIntent, application }),
        },
      );
      if (!response.ok) throw new Error();
      setEvaluationSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const declineEvaluation = async () => {
    if (!deliveryId || !evaluationPhase) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/anchor-deliveries/${encodeURIComponent(deliveryId)}/evaluation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ declined: true }),
        },
      );
      if (!response.ok) throw new Error();
      setEvaluationSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const setPaused = async (paused: boolean) => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/anchor-plans/${encodeURIComponent(planId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused }),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { plan: Plan };
      setPlan((current) => (current ? { ...current, paused: body.plan.paused } : body.plan));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/anchor-plans/${encodeURIComponent(planId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error();
      setStopped(true);
      setPlan(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (stopped) return <main className="mx-auto max-w-xl p-8">{t('anchoring.planStopped')}</main>;
  if (error && !plan)
    return (
      <main role="alert" className="mx-auto max-w-xl p-8 text-destructive">
        {t('anchoring.planLoadFailed')}
      </main>
    );
  if (!plan) return <main className="mx-auto max-w-xl p-8">{t('common.loading')}</main>;

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-8" dir="auto">
      <div>
        <h1 className="text-2xl font-semibold">{t('anchoring.planTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan.paused ? t('anchoring.planPaused') : t('anchoring.planActive')}
        </p>
      </div>
      {evaluationPhase && !evaluationSent && (
        <section className="grid gap-4 rounded-lg border p-4">
          <div>
            <h2 className="font-semibold">{t('anchoring.coldEvaluationTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('anchoring.coldEvaluationDescription')}
            </p>
          </div>
          {[
            ['relevance', t('anchoring.evaluationRelevance'), relevance, setRelevance],
            ['returnIntent', t('anchoring.evaluationReturnIntent'), returnIntent, setReturnIntent],
            ['application', t('anchoring.evaluationApplication'), application, setApplication],
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
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void declineEvaluation()}
              className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50"
            >
              {t('anchoring.hotEvaluationSkip')}
            </button>
            <button
              type="button"
              disabled={busy || !relevance || !returnIntent || !application}
              onClick={() => void submitEvaluation()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 className="me-2 size-4 animate-spin" />}
              {t('anchoring.hotEvaluationSubmit')}
            </button>
          </div>
        </section>
      )}
      {evaluationSent && <p role="status">{t('anchoring.coldEvaluationSent')}</p>}
      {error && <p className="text-sm text-destructive">{t('anchoring.planUpdateFailed')}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void setPaused(!plan.paused)}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="me-2 size-4 animate-spin" />}
          {plan.paused ? t('anchoring.planResume') : t('anchoring.planPause')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void stop()}
          className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium text-destructive disabled:opacity-50"
        >
          {t('anchoring.planStop')}
        </button>
      </div>
    </main>
  );
}
