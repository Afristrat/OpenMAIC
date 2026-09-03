export interface SessionReplayEvent {
  id: number;
  tsMs: number;
  actor: 'agent' | 'user' | 'system';
  eventType: string;
  payload: Record<string, unknown>;
  audioPath: string | null;
  audioBytes: number;
}

export interface SessionReplay {
  events: SessionReplayEvent[];
  durationMs: number;
  audioBytes: number;
  audioMegabytes: number;
}

export function buildSessionReplay(events: SessionReplayEvent[]): SessionReplay {
  const ordered = [...events].sort((left, right) => left.tsMs - right.tsMs || left.id - right.id);
  const audioBytes = ordered.reduce((total, event) => total + event.audioBytes, 0);
  return {
    events: ordered,
    durationMs: ordered.at(-1)?.tsMs ?? 0,
    audioBytes,
    audioMegabytes: audioBytes / 1_048_576,
  };
}

export function findReplayAudioAt(
  events: SessionReplayEvent[],
  positionMs: number,
): SessionReplayEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.tsMs <= positionMs && event.audioPath) return event;
  }
  return null;
}
