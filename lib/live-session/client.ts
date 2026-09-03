import type { LiveSessionEventInput } from './contracts';

let activeSession: { id: string; startedAt: number } | null = null;

async function requireSuccess(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? fallback);
}

export async function startLiveSession(stageId: string): Promise<string> {
  const response = await fetch('/api/live-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageId, recorded: true }),
  });
  await requireSuccess(response, 'Impossible de démarrer l’enregistrement');
  const body = (await response.json()) as { session: { id: string } };
  activeSession = { id: body.session.id, startedAt: Date.now() };
  return body.session.id;
}

export function getActiveLiveSessionId(): string | null {
  return activeSession?.id ?? null;
}

export async function stopLiveSession(): Promise<void> {
  const session = activeSession;
  activeSession = null;
  if (!session) return;
  const response = await fetch(`/api/live-sessions/${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ended: true }),
  });
  await requireSuccess(response, 'Impossible de terminer l’enregistrement');
}

export async function recordLiveSessionEvent(
  actor: LiveSessionEventInput['actor'],
  eventType: string,
  payload: Record<string, unknown>,
  audioSource?: string | Blob,
): Promise<void> {
  const session = activeSession;
  if (!session) return;
  const event = {
    tsMs: Math.max(0, Date.now() - session.startedAt),
    actor,
    eventType,
    payload,
    audioPath: null,
    audioBytes: 0,
  } satisfies LiveSessionEventInput;

  let request: RequestInit;
  let audio: Blob | null = audioSource instanceof Blob ? audioSource : null;
  if (typeof audioSource === 'string') {
    const audioResponse = await fetch(audioSource).catch(() => null);
    if (audioResponse?.ok) audio = await audioResponse.blob();
  }
  if (audio) {
    const form = new FormData();
    form.set('event', JSON.stringify(event));
    form.set('audio', audio, 'track');
    request = { method: 'POST', body: form };
  } else {
    request = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    };
  }

  const response = await fetch(
    `/api/live-sessions/${encodeURIComponent(session.id)}/events`,
    request,
  );
  await requireSuccess(response, 'Impossible d’enregistrer l’événement');
}
