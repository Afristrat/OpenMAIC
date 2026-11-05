'use client';

import { useCallback, useEffect, useState } from 'react';

export type YoutubeUploadStatus = 'queued' | 'uploading' | 'done' | 'error';

export type YoutubeUpload = {
  id: string;
  exportJobId: string;
  chapterIndex: number | null;
  title: string;
  status: YoutubeUploadStatus;
  videoId: string | null;
  appliedPrivacy: string | null;
  error: string | null;
};

export type YoutubeState = {
  loading: boolean;
  failed: boolean;
  configured: boolean;
  channel: { id: string; title: string } | null;
  uploads: YoutubeUpload[];
};

const POLL_INTERVAL_MS = 5000;
const INITIAL: YoutubeState = {
  loading: true,
  failed: false,
  configured: false,
  channel: null,
  uploads: [],
};

function isUploadStatus(value: unknown): value is YoutubeUploadStatus {
  return value === 'queued' || value === 'uploading' || value === 'done' || value === 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readUpload(value: unknown): YoutubeUpload[] {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.exportJobId !== 'string' ||
    typeof value.title !== 'string' ||
    !isUploadStatus(value.status)
  ) {
    return [];
  }
  return [
    {
      id: value.id,
      exportJobId: value.exportJobId,
      chapterIndex: typeof value.chapterIndex === 'number' ? value.chapterIndex : null,
      title: value.title,
      status: value.status,
      videoId: typeof value.videoId === 'string' ? value.videoId : null,
      appliedPrivacy: typeof value.appliedPrivacy === 'string' ? value.appliedPrivacy : null,
      error: typeof value.error === 'string' ? value.error : null,
    },
  ];
}

function readState(body: unknown): YoutubeState | null {
  if (!isRecord(body) || body.success !== true || typeof body.configured !== 'boolean') return null;
  const channel = body.channel;
  return {
    loading: false,
    failed: false,
    configured: body.configured,
    channel:
      isRecord(channel) && typeof channel.id === 'string' && typeof channel.title === 'string'
        ? { id: channel.id, title: channel.title }
        : null,
    uploads: Array.isArray(body.uploads) ? body.uploads.flatMap(readUpload) : [],
  };
}

/** Connexion YouTube de la personne et suivi de ses envois (relevé toutes les 5 s tant qu'un envoi court). */
export function useYoutube(enabled: boolean): {
  state: YoutubeState;
  refresh: () => Promise<void>;
  disconnect: () => Promise<boolean>;
} {
  const [state, setState] = useState<YoutubeState>(INITIAL);

  const fetchState = useCallback(async (): Promise<YoutubeState> => {
    try {
      const response = await fetch('/api/youtube/connection', { cache: 'no-store' });
      const next = response.ok ? readState(await response.json()) : null;
      return next ?? { ...INITIAL, loading: false, failed: true };
    } catch {
      return { ...INITIAL, loading: false, failed: true };
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setState(await fetchState());
  }, [fetchState]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, fetchState]);

  const active = state.uploads.some((u) => u.status === 'queued' || u.status === 'uploading');
  useEffect(() => {
    if (!enabled || !active) return;
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, active, refresh]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/youtube/connection', { method: 'DELETE' });
      if (response.ok) await refresh();
      return response.ok;
    } catch {
      return false;
    }
  }, [refresh]);

  return { state, refresh, disconnect };
}
