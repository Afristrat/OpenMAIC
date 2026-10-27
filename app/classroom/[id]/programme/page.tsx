'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useI18n } from '@/lib/hooks/use-i18n';
import { ProgrammeDocument } from '@/components/syllabus/programme-document';
import type { ClassroomPlan } from '@/lib/types/generation';

type State =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; plan: ClassroomPlan; language: 'fr-FR' | 'ar-MA' | 'en-US' };

/** Programme d'une formation : lecture, impression et enregistrement en PDF par la fenêtre d'impression. */
export default function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/classroom/plan?id=${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error('unavailable');
        setState({ status: 'ready', plan: json.plan, language: json.language });
        // Le navigateur propose ce titre comme nom du fichier PDF.
        document.title = json.plan.courseTitle;
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      });
    return () => controller.abort();
  }, [id]);

  return (
    <ThemeProvider>
      <div
        className="min-h-screen bg-background"
        dir={state.status === 'ready' && state.language === 'ar-MA' ? 'rtl' : undefined}
      >
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur print:hidden">
          <Link
            href={`/classroom/${id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl-flip" />
            {t('programme.back')}
          </Link>
          {state.status === 'ready' && (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {t('programme.downloadHint')}
              </span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Download className="size-4" />
                {t('programme.download')}
              </button>
            </div>
          )}
        </div>
        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('programme.loading')}
          </div>
        )}
        {state.status === 'unavailable' && (
          <p className="py-24 text-center text-sm text-muted-foreground">
            {t('programme.unavailable')}
          </p>
        )}
        {state.status === 'ready' && <ProgrammeDocument plan={state.plan} />}
      </div>
    </ThemeProvider>
  );
}
