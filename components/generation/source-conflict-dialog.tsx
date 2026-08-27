'use client';

import { useState } from 'react';
import { FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  suggestedRequirement?: string;
  references?: string[];
}

interface SourceConflictDialogProps {
  conflict: SourceConflict | null;
  onRemoveSource: () => void;
  onUseSuggestion: (requirement: string) => void;
  onReview: () => void;
}

export function SourceConflictDialog({
  conflict,
  onRemoveSource,
  onUseSuggestion,
  onReview,
}: SourceConflictDialogProps) {
  return (
    <AlertDialog open={conflict !== null}>
      {conflict && (
        <SourceConflictContent
          key={`${conflict.status}:${conflict.suggestedRequirement ?? ''}`}
          conflict={conflict}
          onRemoveSource={onRemoveSource}
          onUseSuggestion={onUseSuggestion}
          onReview={onReview}
        />
      )}
    </AlertDialog>
  );
}

function SourceConflictContent({
  conflict,
  onRemoveSource,
  onUseSuggestion,
  onReview,
}: Omit<SourceConflictDialogProps, 'conflict'> & { conflict: SourceConflict }) {
  const { t } = useI18n();
  const [suggestion, setSuggestion] = useState(conflict.suggestedRequirement ?? '');

  return (
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
        {conflict.references && conflict.references.length > 0 && (
          <div className="rounded-xl border p-3">
            <p className="mb-2 font-medium text-muted-foreground">
              {t('generation.sourceConflict.references')}
            </p>
            <ul className="list-disc space-y-1 ps-5">
              {conflict.references.map((reference) => (
                <li key={reference}>{reference}</li>
              ))}
            </ul>
          </div>
        )}
        {conflict.suggestedRequirement && (
          <div className="space-y-2">
            <label htmlFor="source-conflict-suggestion" className="font-medium">
              {t('generation.sourceConflict.suggestion')}
            </label>
            <Textarea
              id="source-conflict-suggestion"
              aria-label={t('generation.sourceConflict.suggestion')}
              value={suggestion}
              onChange={(event) => setSuggestion(event.target.value)}
              rows={6}
            />
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="outline" onClick={onReview}>
          {t('generation.sourceConflict.review')}
        </Button>
        <Button onClick={onRemoveSource}>{t('generation.sourceConflict.removeSource')}</Button>
        {conflict.suggestedRequirement && (
          <Button onClick={() => onUseSuggestion(suggestion.trim())} disabled={!suggestion.trim()}>
            {t('generation.sourceConflict.useSuggestion')}
          </Button>
        )}
      </div>
    </AlertDialogContent>
  );
}
