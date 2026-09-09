'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { useClassroomOrganizationId } from '@/lib/contexts/classroom-organization';
import { useStageStore } from '@/lib/store/stage';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';
import { LearningObservationOutbox } from '@/lib/telemetry/learning-observation-outbox';
import type { PedagogySession } from '@/lib/telemetry/learning-observation-schema';
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
  const orgId = useClassroomOrganizationId();
  const observer = useRef<Observer | null>(null);
  const [failedScope, setFailedScope] = useState<{
    stageId: string;
    userId: string;
    orgId: string;
  } | null>(null);
  const error =
    failedScope !== null &&
    failedScope.stageId === stageId &&
    failedScope.userId === userId &&
    failedScope.orgId === orgId;

  useEffect(() => {
    if (!stageId || !userId || !orgId) return;
    let buffer: LearningObservationBuffer | null = null;
    let activeEpoch: string | null = null;
    // Retain only a write that failed locally; accepted writes live in the durable outbox.
    let pending: PedagogySession | null = null;
    let mode: EngineMode = 'idle';
    let disposed = false;
    let revision = 0;
    let sending = false;
    let sceneIds: string[] = [];
    let agentCount = 0;
    const outbox = () => new LearningObservationOutbox(userId, window.localStorage);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('qalem-consent');
    const showError = (value: boolean) => {
      if (!disposed) setFailedScope(value ? { stageId, userId, orgId } : null);
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
      if (sending) return;
      sending = true;
      try {
        while (true) {
          const payload = outbox().read()[0] ?? pending;
          if (!payload) break;
          if (payload === pending) {
            outbox().put(payload);
            pending = null;
          }
          // Never relabel a persisted observation with a newly granted consent epoch.
          if ((await consent()) !== payload.consentEpoch) {
            outbox().remove(payload.sessionId);
            continue;
          }
          // Withdrawal or another tab's acknowledgement may have removed it during GET.
          if (
            !outbox()
              .read()
              .some((item) => item.sessionId === payload.sessionId)
          )
            continue;
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
          outbox().remove(payload.sessionId);
        }
        showError(false);
      } catch {
        showError(true);
      } finally {
        sending = false;
      }
    };
    const finish = () => {
      if (!buffer || pending) return;
      pending = buffer.snapshot(sceneIds, agentCount);
      buffer = null;
      // Synchronous write before any awaited network operation, including pagehide.
      try {
        if (pending) outbox().put(pending);
        pending = null;
      } catch {
        showError(true);
      }
      void send();
    };
    const syncScene = () => {
      const state = useStageStore.getState();
      if (state.stage?.id !== stageId) return;
      sceneIds = state.scenes.map((scene) => scene.id);
      agentCount = state.stage.agentIds?.length ?? state.stage.generatedAgentConfigs?.length ?? 0;
      const scene = state.scenes.find((item) => item.id === state.currentSceneId);
      if (scene) {
        if (!buffer && activeEpoch && !pending) {
          buffer = new LearningObservationBuffer(
            stageId,
            activeEpoch,
            crypto.randomUUID(),
            undefined,
            orgId,
          );
          buffer.visibility(document.visibilityState === 'visible');
        }
        buffer?.scene(scene.id, scene.type);
      } else if (state.currentSceneId === '__pending__' && state.generationComplete) finish();
    };
    const refresh = async () => {
      const ticket = ++revision;
      try {
        const epoch = await consent();
        if (disposed || ticket !== revision) return;
        if (!epoch) {
          activeEpoch = null;
          buffer = null;
          pending = null;
          outbox().clear();
          showError(false);
          return;
        }
        if (pending && pending.consentEpoch !== epoch) pending = null;
        if (buffer?.consentEpoch !== epoch) buffer = null;
        activeEpoch = epoch;
        syncScene();
        void send();
      } catch {
        activeEpoch = null;
        buffer = null;
      }
    };
    const changed = () => {
      activeEpoch = null;
      buffer = null;
      pending = null;
      showError(false);
      void refresh();
    };
    const visibility = () => {
      buffer?.visibility(document.visibilityState === 'visible');
      if (document.visibilityState === 'visible') void refresh();
    };
    const leaving = () => {
      finish();
      activeEpoch = null;
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
    window.addEventListener('pagehide', leaving);
    window.addEventListener('pageshow', refresh);
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
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('online', send);
      document.removeEventListener('visibilitychange', visibility);
      channel?.close();
    };
  }, [stageId, userId, orgId]);

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
