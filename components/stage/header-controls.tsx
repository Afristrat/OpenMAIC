'use client';

import { useState } from 'react';
import {
  Archive,
  BookOpenCheck,
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Monitor,
  Moon,
  Package,
  Settings,
  Sun,
  Video,
  Workflow,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useExportClassroom } from '@/lib/export/use-export-classroom';
import { useExportMp4 } from '@/lib/export/use-export-mp4';
import { useExportLearningPackage } from '@/lib/export/use-export-learning-package';
import { LanguageSwitcher } from '../language-switcher';
import { SettingsDialog } from '../settings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { StageMode } from '@/lib/types/stage';
import type { ResearchSource } from '@openmaic/dsl';

// Zustand selectors must return the same reference when the selected value has
// not changed. An inline `?? []` allocates on every store read and causes React
// to keep scheduling updates for classrooms without research sources.
const EMPTY_RESEARCH_SOURCES: ResearchSource[] = [];

interface HeaderControlsProps {
  readonly mode?: StageMode;
  readonly canEdit?: boolean;
  readonly onToggleEditMode?: () => void;
  /**
   * `default` — the chunky h-9 pill used in the playback Stage Header.
   * `compact` — slightly tighter padding for embedding in CommandBar's
   * right slot (Pro mode chrome already eats height, so the pill backs
   * off ring weight / blur to keep the CommandBar quiet).
   */
  readonly variant?: 'default' | 'compact';
}

/**
 * Stage-level global controls: language picker, theme picker, settings
 * modal trigger, and the Pro Switch. Extracted out of `Header` so the
 * Pro mode CommandBar can absorb the same affordances and the playback
 * Header doesn't need to stay mounted just to host them — Pro mode
 * therefore lands on a single top-chrome bar instead of stacking the
 * Stage Header above the EditShell CommandBar.
 *
 * Only one instance is ever mounted at a time (Stage renders Header
 * for playback and EditShell.CommandBar's trailing slot for edit, but
 * never both), so dropdown / dialog state and refs stay co-located
 * here without cross-instance leakage.
 */
export function HeaderControls({
  mode,
  canEdit,
  onToggleEditMode,
  variant = 'default',
}: HeaderControlsProps) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Export plumbing — uses the stage / media task stores to check
  // readiness, then hands off to the export hooks. Available in both
  // playback and edit chrome so the icon's screen position is stable
  // across mode swaps (was previously in `Header` only, missing from
  // CommandBar's right cluster).
  const scenes = useStageStore((s) => s.scenes);
  const researchSources = useStageStore((s) => s.stage?.researchSources ?? EMPTY_RESEARCH_SOURCES);
  const generatingOutlines = useStageStore((s) => s.generatingOutlines);
  const failedOutlines = useStageStore((s) => s.failedOutlines);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);
  const { exporting: isExporting, exportPPTX, exportResourcePack } = useExportPPTX();
  const { exporting: isExportingZip, exportClassroomZip } = useExportClassroom();
  const { exporting: isExportingMp4, exportMp4 } = useExportMp4();
  const { exporting: isExportingLearningPackage, exportLearningPackage } =
    useExportLearningPackage();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const launchExport = (action: () => void) => {
    setExportMenuOpen(false);
    setTimeout(action, 0);
  };

  const canExport =
    scenes.length > 0 &&
    generatingOutlines.length === 0 &&
    failedOutlines.length === 0 &&
    Object.values(mediaTasks).every((task) => task.status === 'done' || task.status === 'failed');

  const compact = variant === 'compact';

  // Self-contained spacing so the control cluster is identical regardless of
  // host. The playback Header (`gap-4`) and the edit CommandBar's trailing
  // slot (`gap-2`) would otherwise impose different inter-control spacing on
  // these fragment children, making the pill/switch/export cluster visibly
  // shift width and position across the mode swap. A fixed internal gap keeps
  // the cluster pixel-stable; both hosts pad to `px-8`, so the right edge
  // anchors identically too.
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          'shrink-0 flex items-center gap-1 backdrop-blur-md shadow-sm rounded-full',
          compact
            ? 'bg-zinc-100/70 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/60 px-1.5 py-1'
            : 'bg-white/60 dark:bg-gray-800/60 border border-gray-100/50 dark:border-gray-700/50 px-2 py-1.5',
        )}
      >
        {/* Language — Radix DropdownMenu so its menu portals to body
            and never gets clipped by an ancestor's overflow-hidden. */}
        <LanguageSwitcher />

        {/* Theme — same Portal-backed DropdownMenu pattern. Non-modal keeps
            Radix from body scroll-locking a fixed-height classroom layout. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
              aria-label={t('settings.theme')}
            >
              {theme === 'light' && <Sun className="w-4 h-4" />}
              {theme === 'dark' && <Moon className="w-4 h-4" />}
              {theme === 'system' && <Monitor className="w-4 h-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-[140px]">
            <DropdownMenuItem
              onSelect={() => setTheme('light')}
              className={cn(
                'cursor-pointer gap-2',
                theme === 'light' &&
                  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
              )}
            >
              <Sun className="w-4 h-4" />
              {t('settings.themeOptions.light')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setTheme('dark')}
              className={cn(
                'cursor-pointer gap-2',
                theme === 'dark' &&
                  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
              )}
            >
              <Moon className="w-4 h-4" />
              {t('settings.themeOptions.dark')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setTheme('system')}
              className={cn(
                'cursor-pointer gap-2',
                theme === 'system' &&
                  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
              )}
            >
              <Monitor className="w-4 h-4" />
              {t('settings.themeOptions.system')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
          aria-label={t('settings.title')}
        >
          <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
        </button>
      </div>

      {/* Pro Switch — toggle property: on/off both clickable, not a
          one-way "Done" button. Disabled only when the current scene
          can't be entered (pending/generating/etc.). Fades in with its
          host bar on the mode swap (no cross-bar layoutId morph: the
          playback Header and edit CommandBar have different left-side
          widths, so morphing made the pill visibly drift). */}
      {onToggleEditMode && (
        <label
          className={cn(
            'shrink-0 inline-flex items-center gap-2.5 rounded-full border shadow-sm transition-colors duration-200',
            'bg-white/60 dark:bg-gray-800/60 backdrop-blur-md',
            compact ? 'h-8 px-2.5' : 'h-9 px-3',
            mode === 'edit'
              ? 'border-violet-500/60 dark:border-violet-400/60'
              : 'border-gray-100/50 dark:border-gray-700/50',
            !canEdit && mode !== 'edit'
              ? 'opacity-60 cursor-not-allowed'
              : 'cursor-pointer hover:border-violet-400/60 dark:hover:border-violet-500/50',
          )}
          // When disabled (e.g. the course-complete placeholder), explain why
          // on hover and point the user to a real scene instead of a bare
          // "Edit course" label they can't act on.
          title={
            !canEdit && mode !== 'edit'
              ? t('stage.proModeDisabledHint')
              : mode === 'edit'
                ? t('stage.doneEditing')
                : t('stage.editCourse')
          }
        >
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-[0.14em] tabular-nums select-none transition-colors duration-200',
              mode === 'edit'
                ? 'text-violet-600 dark:text-violet-300'
                : 'text-gray-500 dark:text-gray-400',
            )}
          >
            {t('edit.proMode')}
          </span>
          <Switch
            checked={mode === 'edit'}
            onCheckedChange={onToggleEditMode}
            disabled={!canEdit && mode !== 'edit'}
            aria-label={mode === 'edit' ? t('stage.doneEditing') : t('stage.editCourse')}
            className="data-[state=checked]:bg-violet-600 dark:data-[state=checked]:bg-violet-500"
          />
        </label>
      )}

      {/* Export / Download — lives to the right of the Pro Switch.
          Not a settings function so it does not belong inside the
          settings pill; kept as a separate sibling sitting between the
          Pro Switch and the right edge of the chrome. */}
      <Dialog open={exportMenuOpen} onOpenChange={setExportMenuOpen}>
        <DialogTrigger asChild>
          <button
            disabled={
              !canExport ||
              isExporting ||
              isExportingZip ||
              isExportingMp4 ||
              isExportingLearningPackage
            }
            title={
              canExport
                ? isExporting || isExportingZip || isExportingMp4 || isExportingLearningPackage
                  ? t('export.exporting')
                  : t('export.pptx')
                : t('share.notReady')
            }
            className={cn(
              'shrink-0 p-2 rounded-full transition-all',
              canExport &&
                !isExporting &&
                !isExportingZip &&
                !isExportingMp4 &&
                !isExportingLearningPackage
                ? 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50',
            )}
            aria-label={t('export.pptx')}
          >
            {isExporting || isExportingZip || isExportingMp4 || isExportingLearningPackage ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('export.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('export.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
          <button
            data-testid="export-mp4"
            onClick={() => launchExport(() => void exportMp4())}
            disabled={isExportingMp4}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Video className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.mp4')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.mp4Desc')}
              </div>
            </div>
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
            {t('export.lmsPackages')}
          </div>
          <button
            data-testid="export-scorm12"
            onClick={() => launchExport(() => void exportLearningPackage('scorm12'))}
            disabled={isExportingLearningPackage}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <BookOpenCheck className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.scorm12')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.scorm12Desc')}
              </div>
            </div>
          </button>
          <button
            data-testid="export-scorm2004"
            onClick={() => launchExport(() => void exportLearningPackage('scorm2004'))}
            disabled={isExportingLearningPackage}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <BookOpenCheck className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.scorm2004')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.scorm2004Desc')}
              </div>
            </div>
          </button>
          <button
            data-testid="export-cmi5"
            onClick={() => launchExport(() => void exportLearningPackage('cmi5'))}
            disabled={isExportingLearningPackage}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Workflow className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.cmi5')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.cmi5Desc')}
              </div>
            </div>
          </button>
          <button
            data-testid="export-pptx"
            onClick={() => launchExport(exportPPTX)}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
            <span>{t('export.pptx')}</span>
          </button>
          <button
            data-testid="export-resource-pack"
            onClick={() => launchExport(exportResourcePack)}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Package className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.resourcePack')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.resourcePackDesc')}
              </div>
            </div>
          </button>
          <button
            data-testid="export-classroom-zip"
            onClick={() => launchExport(() => void exportClassroomZip())}
            disabled={isExportingZip}
            className="flex w-full items-center gap-2.5 rounded-md px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Archive className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.classroomZip')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.classroomZipDesc')}
              </div>
            </div>
          </button>
          </div>
        </DialogContent>
      </Dialog>

      {researchSources.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-gray-100/50 bg-white/60 text-gray-400 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-gray-800 hover:shadow dark:border-gray-700/50 dark:bg-gray-800/60 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label={t('classroom.researchSources')}
              title={t('classroom.researchSources')}
            >
              <BookOpenCheck className="size-4" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('classroom.researchSourcesTitle')}</DialogTitle>
              <DialogDescription>{t('classroom.researchSourcesDescription')}</DialogDescription>
            </DialogHeader>
            <ol className="space-y-3">
              {researchSources.map((source) => (
                <li key={source.url} className="rounded-lg border border-border/70 p-3">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {source.title}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  {source.excerpt && (
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {source.excerpt}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </DialogContent>
        </Dialog>
      )}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
