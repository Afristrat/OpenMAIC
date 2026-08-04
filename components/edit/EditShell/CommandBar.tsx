'use client';

import { ArrowLeft, Redo2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { EditorCommand, SurfaceHistory } from '@/lib/edit/scene-editor-surface';
import {
  flushClassroomPersistence,
  getClassroomSaveState,
  retryClassroomPersistence,
  subscribeClassroomSaveState,
} from '@/lib/edit/classroom-persistence';

interface CommandBarProps {
  readonly title: string;
  readonly history?: SurfaceHistory;
  readonly commands?: readonly EditorCommand[];
  /**
   * Right-edge slot owned by Stage. In Pro mode it carries the
   * HeaderControls (settings pill + Pro Switch + Download) since Stage
   * Header is unmounted to keep top chrome to a single bar.
   */
  readonly trailing?: ReactNode;
}

/**
 * Top bar of the Pro mode chrome. Undo/redo + title on the left, insert
 * primitives in the center, surface commands on the right. History /
 * insertItems / commands are all optional so the bar renders cleanly when
 * no surface is registered for the current scene type.
 *
 * Exiting Pro mode is handled by the global Pro Switch in the playback
 * Header (which stays mounted above this bar) — Pro mode is a toggle,
 * not a one-way state, so we deliberately do *not* place a "Done" pill
 * here that would compete with the Switch's affordance.
 */
export function CommandBar({ title, history, commands, trailing }: CommandBarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const saveState = useSyncExternalStore(
    subscribeClassroomSaveState,
    getClassroomSaveState,
    getClassroomSaveState,
  );

  const backToHome = async () => {
    setLeaving(true);
    if (await flushClassroomPersistence()) router.push('/app');
    setLeaving(false);
  };

  return (
    <header className="flex h-20 shrink-0 items-center gap-3 border-b border-zinc-200/60 px-8 dark:border-zinc-800/60 max-md:h-auto max-md:min-h-20 max-md:flex-wrap max-md:gap-2 max-md:px-2 max-md:py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 max-md:basis-full">
        {/* Back-to-home — mirrors playback Header's leftmost button so the
            user has the same global-out affordance across modes. */}
        <IconButton
          title={t('generation.backToHome')}
          showLabel
          disabled={leaving}
          onClick={backToHome}
        >
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        {history && (
          <>
            <IconButton
              title={t('edit.undo')}
              showLabel
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <Undo2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              title={t('edit.redo')}
              showLabel
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <Redo2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <span
          className={cn('ml-2 truncate text-sm font-semibold text-zinc-700 dark:text-zinc-200')}
          title={title}
        >
          {title}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:overflow-x-auto">
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'flex items-center gap-2 text-xs',
            saveState === 'error' ? 'text-destructive' : 'text-zinc-500 dark:text-zinc-400',
          )}
        >
          <span>{t(`edit.save.${saveState}`)}</span>
          {saveState === 'error' && (
            <Button size="sm" variant="outline" onClick={retryClassroomPersistence}>
              {t('edit.save.retry')}
            </Button>
          )}
        </div>
        {commands && commands.length > 0 && (
          <div className="flex shrink-0 items-center gap-1">
            {commands.map((command) => (
              <IconButton
                key={command.id}
                title={command.tooltip ?? command.label}
                disabled={command.disabled}
                onClick={command.onInvoke}
              >
                {command.icon ?? <span className="px-1 text-xs">{command.label}</span>}
              </IconButton>
            ))}
          </div>
        )}
        {trailing}
      </div>
    </header>
  );
}

function IconButton({
  title,
  showLabel = false,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  readonly title: string;
  readonly showLabel?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={title}
          className={cn(
            'h-8 shrink-0 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 max-md:h-11 max-md:w-auto max-md:gap-2 max-md:px-3',
            showLabel ? 'w-auto gap-2 px-3' : 'w-8',
          )}
          {...props}
        >
          {children}
          <span className={cn('text-xs', showLabel ? 'inline' : 'hidden max-md:inline')}>
            {title}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
