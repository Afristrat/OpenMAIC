'use client';

import { ArrowRight, MessagesSquare } from 'lucide-react';

interface SceneCompletionGateProps {
  readonly title: string;
  readonly deepenLabel: string;
  readonly continueLabel: string;
  readonly onDeepen: () => void;
  readonly onContinue: () => void;
}

export function SceneCompletionGate({
  title,
  deepenLabel,
  continueLabel,
  onDeepen,
  onContinue,
}: SceneCompletionGateProps) {
  return (
    <section
      data-scene-completion-gate="true"
      aria-label={title}
      className="absolute inset-x-3 bottom-3 z-30 mx-auto flex w-[min(44rem,calc(100%-1.5rem))] flex-col gap-3 rounded-2xl border border-violet-200/80 bg-white/95 p-4 shadow-2xl shadow-violet-950/15 backdrop-blur-xl dark:border-violet-700/50 dark:bg-gray-950/95 sm:flex-row sm:items-center"
    >
      <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onDeepen}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-800 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
        >
          <MessagesSquare className="size-4" aria-hidden="true" />
          {deepenLabel}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
        >
          {continueLabel}
          <ArrowRight className="size-4 rtl-flip" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
