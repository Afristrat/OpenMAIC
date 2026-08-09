'use client';

import { FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useI18n } from '@/lib/hooks/use-i18n';

export interface SourceConflict {
  status: 'conflicting' | 'uncertain';
  requestTopic: string;
  sourceTopic: string;
  explanation: string;
}

interface SourceConflictDialogProps {
  conflict: SourceConflict | null;
  onRemoveSource: () => void;
  onUseSource: () => void;
  onReview: () => void;
}

export function SourceConflictDialog({
  conflict,
  onRemoveSource,
  onUseSource,
  onReview,
}: SourceConflictDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open={conflict !== null}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <FileWarning aria-hidden="true" className="size-6" />
          </div>
          <AlertDialogTitle>{t('generation.sourceConflict.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('generation.sourceConflict.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflict && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="mb-1 font-medium text-muted-foreground">
                  {t('generation.sourceConflict.requestTopic')}
                </p>
                <p>{conflict.requestTopic}</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="mb-1 font-medium text-muted-foreground">
                  {t('generation.sourceConflict.sourceTopic')}
                </p>
                <p>{conflict.sourceTopic}</p>
              </div>
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
              {conflict.explanation}
            </p>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" onClick={onReview}>
            {t('generation.sourceConflict.review')}
          </Button>
          <Button variant="secondary" onClick={onUseSource}>
            {t('generation.sourceConflict.useSource')}
          </Button>
          <Button onClick={onRemoveSource}>{t('generation.sourceConflict.removeSource')}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
