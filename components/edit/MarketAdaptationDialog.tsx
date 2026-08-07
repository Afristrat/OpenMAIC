'use client';

import { Globe2, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  buildMarketAdaptationInstruction,
  planMarketAdaptation,
  type MarketAdaptationPlan,
} from '@/lib/formation-engine/market-adaptation';
import { DEFAULT_LEARNING_CONTEXT } from '@/lib/formation-engine/learning-context';
import { useStageStore } from '@/lib/store/stage';

interface MarketAdaptationDialogProps {
  readonly disabled?: boolean;
  readonly agentRunning: boolean;
  readonly onAdapt: (instruction: string) => Promise<boolean>;
}

export function MarketAdaptationDialog({
  disabled,
  agentRunning,
  onAdapt,
}: MarketAdaptationDialogProps) {
  const { t } = useI18n();
  const stage = useStageStore((state) => state.stage);
  const scenes = useStageStore((state) => state.scenes);
  const updateStage = useStageStore((state) => state.updateStage);
  const source = stage?.learningContext ?? DEFAULT_LEARNING_CONTEXT;
  const [open, setOpen] = useState(false);
  const [territory, setTerritory] = useState(source.territory);
  const [currencyCode, setCurrencyCode] = useState(source.currencyCode);
  const [plan, setPlan] = useState<MarketAdaptationPlan | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTerritory(source.territory);
    setCurrencyCode(source.currencyCode);
    setPlan(null);
    setError(null);
  }, [open, source.currencyCode, source.territory]);

  const counts = useMemo(() => {
    const impacts = plan?.impacts ?? [];
    return {
      automatable: impacts.filter((impact) => impact.automatable).length,
      manual: impacts.filter((impact) => !impact.automatable).length,
    };
  }, [plan]);

  const analyze = () => {
    if (!stage) return;
    setError(null);
    try {
      setPlan(planMarketAdaptation(stage, scenes, { territory, currencyCode }));
    } catch {
      setPlan(null);
      setError(t('edit.market.invalidContext'));
    }
  };

  const apply = async () => {
    if (!stage || !plan) return;
    setApplying(true);
    setError(null);
    try {
      if (counts.automatable > 0) {
        const succeeded = await onAdapt(buildMarketAdaptationInstruction(plan));
        if (!succeeded) {
          setError(t('edit.market.failed'));
          return;
        }
      }
      updateStage({ learningContext: plan.target });
      setOpen(false);
    } finally {
      setApplying(false);
    }
  };

  const busy = applying || agentRunning;
  const applyDisabled = busy || !plan?.hasChanges || counts.manual > 0;
  const applyLabel =
    counts.automatable === 0
      ? t('edit.market.saveContext')
      : counts.automatable === 1
        ? t('edit.market.applyOne')
        : t('edit.market.applyMany', { count: counts.automatable });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || agentRunning}
          className="h-9 gap-2 rounded-xl max-md:h-11"
        >
          <Globe2 className="size-4" />
          <span>{t('edit.market.trigger')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto max-md:max-w-[calc(100vw-1rem)] max-md:p-4">
        <DialogHeader>
          <DialogTitle>{t('edit.market.title')}</DialogTitle>
          <DialogDescription>{t('edit.market.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            {t('generation.territory')}
            <Input
              data-testid="market-territory"
              value={territory}
              disabled={busy}
              onChange={(event) => setTerritory(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {t('generation.currency')}
            <Input
              data-testid="market-currency"
              value={currencyCode}
              maxLength={3}
              disabled={busy}
              onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
            />
          </label>
        </div>

        <Button type="button" variant="secondary" disabled={busy} onClick={analyze}>
          {t('edit.market.analyze')}
        </Button>

        {plan && (
          <div className="space-y-3" data-testid="market-impact-list">
            <p className="text-sm font-medium">
              {plan.impacts.length === 0
                ? t('edit.market.noImpact')
                : t('edit.market.impactCount', { count: plan.impacts.length })}
            </p>
            {plan.impacts.map((impact) => (
              <div
                key={impact.sceneId}
                className="rounded-xl border border-border bg-muted/30 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {impact.order}. {impact.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {impact.automatable ? t('edit.market.automatic') : t('edit.market.manual')}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {impact.reasons.map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground"
                    >
                      {t(`edit.market.reason.${reason}`)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {counts.manual > 0 && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                {t('edit.market.manualBlock', { count: counts.manual })}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={applyDisabled} onClick={apply}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
