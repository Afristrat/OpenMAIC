'use client';

import { ScanLine, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useCanvasStore } from '@/lib/store/canvas';
import { useResolvedSlideContent } from './use-slide-surface';
import { useSlideEditSession } from './slide-edit-session';

interface SelectionSafetyBarProps {
  readonly elementIds: readonly string[];
}

/** Visible, reversible repair for elements generated outside the slide. */
export function SelectionSafetyBar({ elementIds }: SelectionSafetyBarProps) {
  const { t } = useI18n();
  const content = useResolvedSlideContent();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const issues = useMemo(() => auditSlideLayout(content.canvas), [content.canvas]);
  const outOfBoundsIds = useMemo(
    () => issues.filter((issue) => issue.type === 'out-of-bounds').map((issue) => issue.elementId),
    [issues],
  );
  const overlappingIds = useMemo(
    () => issues.flatMap((issue) => (issue.type === 'overlap' ? issue.elementIds : [])),
    [issues],
  );
  const hasSelection = elementIds.length > 0;
  if (!hasSelection && outOfBoundsIds.length === 0 && overlappingIds.length === 0) return null;

  return (
    <div className="absolute right-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-slate-950/90 p-1.5 text-white shadow-lg backdrop-blur">
      {outOfBoundsIds.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 border-amber-300/50 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
          onClick={() => setActiveElementIdList(outOfBoundsIds)}
        >
          <TriangleAlert className="h-4 w-4" />
          {t('edit.layout.outOfBounds', { count: outOfBoundsIds.length })}
        </Button>
      )}
      {overlappingIds.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 border-rose-300/50 bg-rose-300/10 text-rose-100 hover:bg-rose-300/20"
          onClick={() => setActiveElementIdList([...new Set(overlappingIds)])}
        >
          <TriangleAlert className="h-4 w-4" />
          {t('edit.layout.overlap', { count: overlappingIds.length / 2 })}
        </Button>
      )}
      {hasSelection && (
        <span className="hidden text-xs text-slate-200 sm:inline">
          {t('edit.selection.count', { count: elementIds.length })}
        </span>
      )}
      {hasSelection && (
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
      )}
    </div>
  );
}
