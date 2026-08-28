'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { migrateScene } from '@/lib/edit/slide-schema';
import type { Scene } from '@/lib/types/stage';
import {
  resolveCurrentSceneId,
  saveStageData,
  type StageStoreData,
} from '@/lib/utils/stage-storage';
import {
  activateClassroomPersistence,
  ClassroomPersistence,
  clearUnsyncedClassroom,
  hasUnsyncedClassroom,
} from '@/lib/edit/classroom-persistence';

const log = createLogger('Classroom');
const E2E_TEST_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

function currentSnapshot(): StageStoreData | null {
  const { stage, scenes, currentSceneId, chats } = useStageStore.getState();
  return stage ? { stage, scenes, currentSceneId, chats } : null;
}

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canViewSources, setCanViewSources] = useState(false);

  const generationStartedRef = useRef(false);
  const serverBackedRef = useRef(false);
  const persistenceRef = useRef<ClassroomPersistence | null>(null);

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      await loadFromStorage(classroomId);
      // A valid local snapshot is immediately usable. The authoritative
      // server refresh below may wait on an unavailable network connection;
      // keeping the whole classroom behind that request made cached
      // classrooms (including plug-in scenes) appear to load forever.
      if (useStageStore.getState().stage) setLoading(false);
      const localSnapshot = currentSnapshot();
      const protectUnsyncedLocal =
        localSnapshot?.stage.id === classroomId && hasUnsyncedClassroom(classroomId);
      if (protectUnsyncedLocal && localSnapshot) {
        persistenceRef.current?.schedule(localSnapshot, true);
      }
      // The server copy is authoritative for generated classrooms. IndexedDB
      // may contain the snapshot created before asynchronous media generation
      // finished; preferring it would keep a classroom visually intact but
      // silently omit its newly persisted narration after a refresh.
      serverBackedRef.current = false;
      setCanEdit(false);
      try {
        const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.classroom) {
            setCanEdit(Boolean(json.canEdit));
            setCanViewSources(Boolean(json.canViewSources));
            const { stage, scenes } = json.classroom;
            if (protectUnsyncedLocal && localSnapshot) {
              serverBackedRef.current = true;
              log.info('Preserved unsynced local classroom:', classroomId);
            } else {
              if (!localSnapshot) clearUnsyncedClassroom(classroomId);
              // setStage intentionally clears the previous classroom, including
              // currentSceneId. Capture the live selection first so a late
              // authoritative refresh cannot send the learner back to scene 1.
              const preferredSceneId = useStageStore.getState().currentSceneId;
              useStageStore.getState().setStage(stage);
              // Normalize legacy slide content (missing schemaVersion) on the
              // way in, same as the store's setScenes/loadFromStorage paths —
              // server snapshots predate the schema field.
              const migrated = (scenes as Scene[]).map(migrateScene);
              const currentSceneId = resolveCurrentSceneId(
                migrated,
                preferredSceneId,
              );
              useStageStore.setState({
                scenes: migrated,
                currentSceneId,
                // Match `loadFromStorage` semantics: mode is transient UI
                // state, not persisted with the stage. Reset on every
                // classroom load so SPA navigation doesn't carry Pro
                // mode across.
                mode: 'playback',
              });
              serverBackedRef.current = true;
              const serverSnapshot = currentSnapshot();
              if (serverSnapshot) await saveStageData(classroomId, serverSnapshot);
              log.info('Loaded authoritative server-side classroom:', classroomId);
            }

            // Hydrate server-generated agents into IndexedDB + registry.
            // Don't set selectedAgentIds here — the general agent
            // restoration logic below (Path 2) handles it uniformly.
            if (stage.generatedAgentConfigs?.length) {
              const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
              await saveGeneratedAgents(stage.id, stage.generatedAgentConfigs);
              log.info('Hydrated server-generated agents for stage:', stage.id);
            }
          }
        } else {
          const hasLocalClassroom = Boolean(useStageStore.getState().stage);
          if (hasLocalClassroom && res.status === 404) {
            setCanEdit(true);
          } else if (!hasLocalClassroom) {
            const failure = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(failure?.error || `Classroom API returned HTTP ${res.status}`);
          }
        }
      } catch (fetchErr) {
        // Local classrooms remain usable offline. A server-backed classroom
        // always refreshes when reachable, which prevents stale media refs.
        log.warn('Authoritative classroom fetch failed:', fetchErr);
        if (useStageStore.getState().stage) setCanEdit(true);
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const teacherProfile = useStageStore.getState().stage?.teacherProfile;
      if (teacherProfile) {
        useAgentRegistry.getState().updateAgent('default-1', {
          name: teacherProfile.name,
          avatar: teacherProfile.avatar,
          voiceConfig: {
            providerId: teacherProfile.providerId as import('@/lib/audio/types').TTSProviderId,
            voiceId: teacherProfile.voiceId,
          },
        });
      }
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      const { restoreAgentSelection } =
        await import('@/lib/orchestration/registry/agent-selection');
      // Keep the user's explicit AgentBar mode/selection when still valid for
      // this stage instead of unconditionally forcing auto mode (which
      // clobbered it on every classroom visit); fall back to the stage-derived
      // defaults otherwise, marking them as NOT user-set so the next classroom
      // never mistakes them for a choice. Stale generated IDs (from another
      // stage / pre-bleed-fix) never validate, so they don't resolve against a
      // leftover registry entry.
      const settings = useSettingsStore.getState();
      const registry = useAgentRegistry.getState();
      const stage = useStageStore.getState().stage;
      const { selection: next, isUserSet } = restoreAgentSelection({
        persisted: { mode: settings.agentMode, selectedAgentIds: settings.selectedAgentIds },
        persistedIsUserSet: settings.agentSelectionIsUserSet,
        generatedAgentIds,
        stageAgentIds: stage?.agentIds,
        isPresetAgent: (id) => {
          const a = registry.getAgent(id);
          return !!a && !a.isGenerated;
        },
      });
      // restoreAgentSelection returns the persisted object as-is when keeping
      // it, so reference checks skip redundant store writes.
      if (next.mode !== settings.agentMode) settings.setAgentMode(next.mode);
      if (next.selectedAgentIds !== settings.selectedAgentIds) {
        settings.setSelectedAgentIds(next.selectedAgentIds);
      }
      if (isUserSet !== settings.agentSelectionIsUserSet) {
        settings.setAgentSelectionIsUserSet(isUserSet);
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage]);

  useEffect(() => {
    if (E2E_TEST_MODE) return;

    const controller = new ClassroomPersistence({
      stageId: classroomId,
      saveLocal: (snapshot) => saveStageData(classroomId, snapshot),
      saveRemote: async (snapshot) => {
        const response = await fetch('/api/classroom', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: snapshot.stage, scenes: snapshot.scenes }),
          // Classroom snapshots regularly exceed Chromium's keepalive payload
          // limit. Exit recovery is handled separately; only a successful PUT
          // may be presented to the author as a saved server revision.
        });
        if (!response.ok) throw new Error(`Classroom save returned HTTP ${response.status}`);
      },
    });
    persistenceRef.current = controller;
    const deactivate = activateClassroomPersistence(controller);
    const unsubscribe = useStageStore.subscribe((state, previous) => {
      if (
        !serverBackedRef.current ||
        (state.stage === previous.stage && state.scenes === previous.scenes)
      )
        return;
      const snapshot = currentSnapshot();
      if (snapshot?.stage.id === classroomId) controller.schedule(snapshot);
    });
    const flushOnPageHide = () => void controller.flush();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void controller.flush();
    };
    const flushBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.state === 'saved') return;
      void controller.flush();
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', flushOnPageHide);
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('beforeunload', flushBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', flushOnPageHide);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('beforeunload', flushBeforeUnload);
      deactivate();
      persistenceRef.current = null;
      void controller.flush().finally(() => controller.dispose());
    };
  }, [classroomId]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage, generationComplete } = state;

    // Check if there are pending outlines. A finished deck is frozen for
    // editing: deleting a slide leaves its outline orphaned, but that must not
    // be treated as an interrupted generation and regenerated. Only resume
    // when generation has not completed.
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = !generationComplete && outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
          languageDirective: params.languageDirective || stage.languageDirective,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      // The deck reached the classroom already fully materialized (e.g. a
      // single-slide course, or a deck whose last slide finished in
      // generation-preview), so generateRemaining's completion path never
      // ran. Record completion now so a later edit/delete is not treated as
      // an interrupted generation. No-op if already complete or not all
      // outlines have scenes.
      useStageStore.getState().markGenerationCompleteIfDone();
      // Resume media only for outlines that still have a scene. On a finished
      // deck the user may have deleted a slide, leaving an orphaned outline;
      // generating its media would waste API calls on a slide that is gone.
      const materializedOrders = new Set(scenes.map((s) => s.order));
      const materializedOutlines = outlines.filter((o) => materializedOrders.has(o.order));
      generateMediaForOutlines(materializedOutlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
      });
    }
  }, [loading, error, generateRemaining]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="h-screen flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-muted-foreground">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Stage
              onRetryOutline={retrySingleOutline}
              canEdit={canEdit}
              canViewSources={canViewSources}
            />
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
