'use client';

import { useCallback, useState } from 'react';
import { FileText, Loader2, Pencil, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { OutlinesEditor } from '@/components/generation/outlines-editor';
import { ProgrammeDocument } from '@/components/syllabus/programme-document';
import { useRegeneratePendingScenes } from '@/components/syllabus/regeneration-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { applyPlanEdit } from '@/lib/syllabus/apply-plan-edit';
import {
  diffPlans,
  isPlanUnchanged,
  normalizeOrder,
  reconcileScenes,
  sortByOrder,
  syllabusSignature,
} from '@/lib/syllabus/plan-diff';
import type { ClassroomPlan, ClassroomSyllabus, SceneOutline } from '@/lib/types/generation';
import { cn } from '@/lib/utils';

type Step = 'view' | 'edit' | 'review';
type Load =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; plan: ClassroomPlan; canEdit: boolean };

/** Bouton « Programme » de la salle de cours : lire le programme, le télécharger en PDF et, pour un auteur, le modifier. */
export function ProgrammeButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const stageId = useStageStore((state) => state.stage?.id ?? null);
  const generating = useStageStore((state) => state.generatingOutlines.length > 0);
  const regenerate = useRegeneratePendingScenes();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('view');
  const [load, setLoad] = useState<Load>({ status: 'idle' });
  const [draft, setDraft] = useState<ClassroomPlan | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPlan = useCallback(async () => {
    if (!stageId) return;
    setLoad({ status: 'loading' });
    try {
      const response = await fetch(`/api/classroom/plan?id=${encodeURIComponent(stageId)}`);
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error('unavailable');
      setLoad({
        status: 'ready',
        plan: json.plan as ClassroomPlan,
        canEdit: Boolean(json.canEdit),
      });
    } catch {
      setLoad({ status: 'unavailable' });
    }
  }, [stageId]);

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (next) {
      setStep('view');
      setDraft(null);
      void fetchPlan();
    }
  };

  const plan = load.status === 'ready' ? load.plan : null;
  const canEdit = load.status === 'ready' && load.canEdit && regenerate !== null;

  const startEdit = () => {
    if (!plan) return;
    setDraft({ ...plan, outlines: normalizeOrder(sortByOrder(plan.outlines)) });
    setStep('edit');
  };

  const review = (() => {
    if (!plan || !draft) return null;
    const store = useStageStore.getState();
    const orderById = new Map(store.outlines.map((outline) => [outline.id, outline.order]));
    const diff = diffPlans(plan.outlines, draft.outlines);
    const reconciled = reconcileScenes({
      previous: plan.outlines,
      next: draft.outlines,
      scenes: store.scenes,
      sceneOrderOf: (outline) => orderById.get(outline.id) ?? outline.order,
    });
    const syllabusChanged =
      syllabusSignature(plan.syllabus) !== syllabusSignature(draft.syllabus) ||
      plan.courseTitle !== draft.courseTitle;
    return {
      diff,
      orphaned: reconciled.orphaned.length,
      unchanged: diff.unchanged.length - reconciled.orphaned.length,
      nothing: isPlanUnchanged(diff) && !syllabusChanged,
      textOnly: isPlanUnchanged(diff) && syllabusChanged,
    };
  })();

  const apply = async () => {
    if (!stageId || !plan || !draft || !review) return;
    setSaving(true);
    try {
      await applyPlanEdit({ stageId, previous: plan, next: draft, regenerate });
      toast.success(t(review.textOnly ? 'programme.appliedTextOnly' : 'programme.applied'));
      setOpen(false);
    } catch {
      toast.error(t('programme.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!stageId) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="programme-open"
          title={t('programme.open')}
          aria-label={t('programme.open')}
          className={cn(
            'shrink-0 rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200',
            className,
          )}
        >
          <FileText className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent
        className={cn('max-h-[90vh] overflow-y-auto', step === 'edit' ? 'max-w-5xl' : 'max-w-3xl')}
        onInteractOutside={(event) => {
          if (step !== 'view') event.preventDefault();
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>
            {step === 'view' ? t('programme.title') : t('programme.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {step === 'view' ? (plan?.courseTitle ?? '') : t('programme.editDescription')}
          </DialogDescription>
        </DialogHeader>

        {load.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('programme.loading')}
          </div>
        )}
        {load.status === 'unavailable' && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t('programme.unavailable')}
          </p>
        )}

        {step === 'view' && plan && (
          <>
            <div className="-mx-6 max-h-[60vh] overflow-y-auto border-y border-border">
              <ProgrammeDocument plan={plan} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={startEdit}
                  disabled={generating}
                  title={generating ? t('programme.locked') : undefined}
                  data-testid="programme-edit"
                >
                  <Pencil className="size-4" />
                  {t('programme.edit')}
                </Button>
              )}
              <Button asChild data-testid="programme-download">
                <a href={`/classroom/${stageId}/programme`} target="_blank" rel="noreferrer">
                  <Download className="size-4" />
                  {t('programme.download')}
                </a>
              </Button>
            </div>
          </>
        )}

        {step === 'edit' && draft && (
          <OutlinesEditor
            courseTitle={draft.courseTitle}
            syllabus={draft.syllabus}
            outlines={draft.outlines}
            onCourseTitleChange={(courseTitle: string) =>
              setDraft((current) => (current ? { ...current, courseTitle } : current))
            }
            onSyllabusChange={(syllabus: ClassroomSyllabus) =>
              setDraft((current) => (current ? { ...current, syllabus } : current))
            }
            onChange={(outlines: SceneOutline[]) =>
              setDraft((current) => (current ? { ...current, outlines } : current))
            }
            onConfirm={() => setStep('review')}
            onBack={() => setStep('view')}
            hideAlwaysReview
            editingExisting
            backLabel={t('programme.cancel')}
            confirmLabel={t('programme.apply')}
          />
        )}

        {step === 'review' && review && (
          <div className="space-y-4" data-testid="programme-review">
            <h3 className="text-base font-semibold">{t('programme.reviewTitle')}</h3>
            {review.nothing ? (
              <p className="text-sm text-muted-foreground">{t('programme.reviewNoChange')}</p>
            ) : review.textOnly ? (
              <p className="text-sm text-muted-foreground">{t('programme.reviewTextOnly')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('programme.reviewIntro')}</p>
                <ul className="space-y-1 text-sm">
                  {review.diff.added.length > 0 && (
                    <li>{t('programme.reviewAdded', { count: review.diff.added.length })}</li>
                  )}
                  {review.diff.modified.length > 0 && (
                    <li>{t('programme.reviewModified', { count: review.diff.modified.length })}</li>
                  )}
                  {review.diff.removed.length > 0 && (
                    <li>{t('programme.reviewRemoved', { count: review.diff.removed.length })}</li>
                  )}
                  {review.diff.moved.length > 0 && (
                    <li>{t('programme.reviewMoved', { count: review.diff.moved.length })}</li>
                  )}
                  {review.unchanged > 0 && (
                    <li>{t('programme.reviewUnchanged', { count: review.unchanged })}</li>
                  )}
                  {review.orphaned > 0 && (
                    <li>{t('programme.reviewOrphaned', { count: review.orphaned })}</li>
                  )}
                </ul>
                {review.diff.modified.length > 0 && (
                  <p
                    className="text-sm font-medium text-amber-700 dark:text-amber-300"
                    role="status"
                  >
                    {t('programme.reviewWarning')}
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep('edit')} disabled={saving}>
                {t('programme.backToEdit')}
              </Button>
              <Button onClick={() => void apply()} disabled={saving || review.nothing}>
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('programme.applying')}
                  </>
                ) : (
                  t('programme.apply')
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
