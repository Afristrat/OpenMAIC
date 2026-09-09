'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { useStageStore } from '@/lib/store/stage';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';
import type { PedagogySession } from '@/lib/telemetry/pedagogy-collector';
import type { EngineMode } from '@/lib/playback';

type Observer = {
  mode(mode: EngineMode): void;
  complete(id: string): void;
  seek(): void;
  retry(): Promise<void>;
};

export function useLearningObservations(stageId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id;
  const observer = useRef<Observer | null>(null);
  const [failedScope, setFailedScope] = useState<{ stageId: string; userId: string } | null>(null);
  const error =
    failedScope !== null && failedScope.stageId === stageId && failedScope.userId === userId;

  useEffect(() => {
    if (!stageId || !userId) return;
    let buffer: LearningObservationBuffer | null = null;
    let pending: PedagogySession | null = null;
    let mode: EngineMode = 'idle';
    let disposed = false;
    let revision = 0;
    let sending = false;
    let sceneIds: string[] = [];
    let agentCount = 0;
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('qalem-consent');
    const showError = (value: boolean) => {
      if (!disposed) setFailedScope(value ? { stageId, userId } : null);
    };
    const consent = async (): Promise<string | null> => {
      const response = await fetch('/api/telemetry-consent', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Consent unavailable');
      const data = await response.json();
      return data.choice === true &&
        typeof data.epoch === 'string' &&
        /^[0-9a-f-]{36}$/i.test(data.epoch)
        ? data.epoch
        : null;
    };
    const send = async () => {
      if (!pending || sending) return;
      sending = true;
      const payload = pending;
      try {
        // Never relabel a pending observation with a newly granted consent epoch.
        if ((await consent()) !== payload.consentEpoch || pending !== payload) {
          if (pending === payload) {
            pending = null;
            showError(false);
          }
          return;
        }
        const response = await fetch('/api/learning-observations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Observation not saved');
        const result = await response.json();
        if (typeof result.recorded !== 'boolean') throw new Error('Invalid acknowledgement');
        if (pending === payload) {
          pending = null;
          showError(false);
        }
      } catch {
        if (pending === payload) showError(true);
      } finally {
        sending = false;
      }
    };
    const finish = () => {
      if (!buffer || pending) return;
      pending = buffer.snapshot(sceneIds, agentCount);
      buffer = null;
      void send();
    };
    const syncScene = () => {
      const state = useStageStore.getState();
      if (state.stage?.id !== stageId) return;
      sceneIds = state.scenes.map((scene) => scene.id);
      agentCount = state.stage.agentIds?.length ?? state.stage.generatedAgentConfigs?.length ?? 0;
      const scene = state.scenes.find((item) => item.id === state.currentSceneId);
      if (scene) buffer?.scene(scene.id, scene.type);
      else if (state.currentSceneId === '__pending__' && state.generationComplete) finish();
    };
    const refresh = async () => {
      const ticket = ++revision;
      try {
        const epoch = await consent();
        if (disposed || ticket !== revision) return;
        if (!epoch) {
          buffer = null;
          pending = null;
          showError(false);
          return;
        }
        if (pending && pending.consentEpoch !== epoch) pending = null;
        if (!pending && buffer?.consentEpoch !== epoch) {
          buffer = new LearningObservationBuffer(stageId, epoch, crypto.randomUUID());
          buffer.visibility(document.visibilityState === 'visible');
          syncScene();
        }
      } catch {
        buffer = null;
      }
    };
    const changed = () => {
      buffer = null;
      pending = null;
      showError(false);
      void refresh();
    };
    const visibility = () => {
      buffer?.visibility(document.visibilityState === 'visible');
      if (document.visibilityState === 'visible') void refresh();
    };
    const quiz = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        !detail ||
        typeof detail !== 'object' ||
        !('stageId' in detail) ||
        detail.stageId !== stageId ||
        !('sceneId' in detail) ||
        typeof detail.sceneId !== 'string' ||
        !('score' in detail) ||
        typeof detail.score !== 'number'
      )
        return;
      buffer?.quiz(detail.sceneId, detail.score);
    };
    const api: Observer = {
      mode(next) {
        if (next !== mode) {
          if (next === 'playing' || next === 'live') buffer?.action('play');
          else if (next === 'paused') buffer?.action('pause');
          mode = next;
        }
      },
      complete(id) {
        buffer?.complete(id);
      },
      seek() {
        buffer?.action('seek');
      },
      retry: send,
    };
    observer.current = api;
    const unsubscribe = useStageStore.subscribe(syncScene);
    window.addEventListener('qalem-consent-change', changed);
    window.addEventListener('qalem-learning-quiz', quiz);
    window.addEventListener('pagehide', finish);
    window.addEventListener('online', send);
    document.addEventListener('visibilitychange', visibility);
    channel?.addEventListener('message', changed);
    void refresh();
    return () => {
      finish();
      disposed = true;
      revision++;
      if (observer.current === api) observer.current = null;
      unsubscribe();
      window.removeEventListener('qalem-consent-change', changed);
      window.removeEventListener('qalem-learning-quiz', quiz);
      window.removeEventListener('pagehide', finish);
      window.removeEventListener('online', send);
      document.removeEventListener('visibilitychange', visibility);
      channel?.close();
    };
  }, [stageId, userId]);

  return useMemo(
    () => ({
      error,
      mode: (mode: EngineMode) => observer.current?.mode(mode),
      complete: (id: string) => observer.current?.complete(id),
      seek: () => observer.current?.seek(),
      retry: () => observer.current?.retry(),
    }),
    [error],
  );
}
