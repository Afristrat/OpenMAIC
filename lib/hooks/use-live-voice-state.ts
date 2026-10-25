'use client';

import { useEffect, useState } from 'react';
import { readLiveVoiceState, type LiveVoiceState } from '@/lib/generation/voice-warning';

/** Reads the real voice state of a saved course once, while `enabled` (a job with a snapshot warning). */
export function useLiveVoiceState(classroomId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<LiveVoiceState>({ kind: 'pending' });
  useEffect(() => {
    if (!enabled || !classroomId) return;
    const controller = new AbortController();
    void readLiveVoiceState(classroomId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, [classroomId, enabled]);
  // A job without course id cannot be read: neutral text rather than an endless wait.
  return enabled && !classroomId ? ({ kind: 'unknown' } as const) : state;
}
