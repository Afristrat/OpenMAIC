'use client';

import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSlideEditSession } from './slide-edit-session';

interface SelectionSafetyBarProps {
  readonly elementIds: readonly string[];
}

/** Visible, reversible repair for elements generated outside the slide. */
export function SelectionSafetyBar({ elementIds }: SelectionSafetyBarProps) {
  const { t } = useI18n();
  if (elementIds.length === 0) return null;

  return (
    <div className="absolute right-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-slate-950/90 p-1.5 text-white shadow-lg backdrop-blur">
      <span className="hidden text-xs text-slate-200 sm:inline">
        {t('edit.selection.count', { count: elementIds.length })}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="gap-1.5"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          useSlideEditSession.getState().applyOp({
            type: 'element.fitCanvas',
            elementIds: [...elementIds],
          })
        }
      >
        <ScanLine className="h-4 w-4" />
        {t('edit.selection.fitCanvas')}
      </Button>
    </div>
  );
}
