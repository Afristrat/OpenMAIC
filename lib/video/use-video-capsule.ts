'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  HyperframesProductionStatus,
  HyperframesVariant,
} from '@/lib/video/hyperframes-types';

export interface VideoCapsuleParams {
  stageId: string;
  sceneId: string;
  audience: string;
  tone: string;
  objective: string;
  durationS: number;
  notes?: string;
}

interface VideoCapsuleState {
  status: HyperframesProductionStatus | 'idle';
  variants: HyperframesVariant[];
  error: string | null;
}

const POLL_INTERVAL_MS = 5000;

/** Crée une capsule vidéo Hyperframes pour une scène et poll son statut jusqu'à `done`/`error`. */
export function useVideoCapsule() {
  const [state, setState] = useState<VideoCapsuleState>({
    status: 'idle',
    variants: [],
    error: null,
  });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const poll = useCallback((id: string) => {
    const tick = async () => {
      try {
        const res = await fetch(`/api/video-capsules/${id}`);
        const body = await res.json();
        if (!res.ok || !body.success) {
          setState((s) => ({ ...s, status: 'error', error: body.error ?? 'Échec du suivi' }));
          return;
        }
        setState({
          status: body.status,
          variants: body.variants ?? [],
          error: body.error ?? null,
        });
        if (!body.done) {
          pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    };
    void tick();
  }, []);

  const generate = useCallback(
    async (params: VideoCapsuleParams) => {
      stopPolling();
      setState({ status: 'queued', variants: [], error: null });
      try {
        const res = await fetch('/api/video-capsules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const body = await res.json();
        if (!res.ok || !body.success) {
          setState({ status: 'error', variants: [], error: body.error ?? 'Échec de la création' });
          return;
        }
        poll(body.id as string);
      } catch (err) {
        setState({
          status: 'error',
          variants: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [poll, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState({ status: 'idle', variants: [], error: null });
  }, [stopPolling]);

  return { ...state, generate, reset };
}
