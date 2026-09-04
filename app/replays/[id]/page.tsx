'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { SceneThumbnailContent } from '@/components/stage/scene-thumbnail-content';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  buildSessionReplay,
  findReplayAudioAt,
  type SessionReplayEvent,
} from '@/lib/playback/session-replay';
import type { Scene } from '@/lib/types/stage';

interface ReplayResponse {
  id: string;
  last_position_ms: number;
  courses: { title: string; stage_id: string } | { title: string; stage_id: string }[];
  session_events: Array<{
    id: number;
    ts_ms: number;
    actor: SessionReplayEvent['actor'];
    event_type: string;
    payload: Record<string, unknown>;
    audio_path: string | null;
    audio_bytes: number;
  }>;
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ReplayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<ReplayResponse | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const lastTick = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    void fetch(`/api/live-sessions/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as { session: ReplayResponse };
      })
      .then(async (body) => {
        setSession(body.session);
        setPosition(body.session.last_position_ms);
        const course = Array.isArray(body.session.courses)
          ? body.session.courses[0]
          : body.session.courses;
        if (!course?.stage_id) return;
        const classroomResponse = await fetch(
          `/api/classroom?id=${encodeURIComponent(course.stage_id)}`,
          { cache: 'no-store' },
        ).catch(() => null);
        if (!classroomResponse?.ok) return;
        const classroomBody = (await classroomResponse.json()) as {
          classroom?: { scenes?: Scene[] };
        };
        setScenes(classroomBody.classroom?.scenes ?? []);
      })
      .catch(() => setError(true));
  }, [id]);

  const replay = useMemo(
    () =>
      buildSessionReplay(
        (session?.session_events ?? []).map((event) => ({
          id: event.id,
          tsMs: event.ts_ms,
          actor: event.actor,
          eventType: event.event_type,
          payload: event.payload,
          audioPath: event.audio_path,
          audioBytes: event.audio_bytes,
        })),
      ),
    [session],
  );

  useEffect(() => {
    if (!playing) return;
    lastTick.current = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTick.current;
      lastTick.current = now;
      setPosition((current) => {
        const next = Math.min(replay.durationMs, current + elapsed);
        if (next >= replay.durationMs) setPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing, replay.durationMs]);

  const savePosition = () => {
    void fetch(`/api/live-sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionMs: Math.round(position) }),
    });
  };

  const activeAudio = findReplayAudioAt(replay.events, position);
  useEffect(() => {
    const player = audioRef.current;
    if (!player || !activeAudio?.audioPath) return;
    const source = `/api/live-sessions/${encodeURIComponent(id)}/audio?path=${encodeURIComponent(activeAudio.audioPath)}`;
    if (!player.src.endsWith(source)) player.src = source;
    const expectedSeconds = Math.max(0, (position - activeAudio.tsMs) / 1000);
    if (Math.abs(player.currentTime - expectedSeconds) > 0.5) player.currentTime = expectedSeconds;
    if (playing) void player.play().catch(() => setPlaying(false));
    else player.pause();
  }, [activeAudio, id, playing, position]);

  if (error)
    return (
      <div role="alert" className="p-8">
        {t('replay.loadFailed')}
      </div>
    );
  if (!session) return <div className="p-8">{t('common.loading')}</div>;
  const course = Array.isArray(session.courses) ? session.courses[0] : session.courses;
  const visibleEvents = replay.events.filter((event) => event.tsMs <= position);
  const latestSceneEvent = visibleEvents.findLast(
    (event) => event.eventType === 'scene_change' && typeof event.payload.sceneId === 'string',
  );
  const activeSceneId =
    typeof latestSceneEvent?.payload.sceneId === 'string'
      ? latestSceneEvent.payload.sceneId
      : scenes[0]?.id;
  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? scenes[0];

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold">{course?.title ?? t('replay.untitled')}</h1>
        {activeScene && (
          <section
            className="relative mt-6 aspect-video overflow-hidden rounded-xl border bg-black shadow-sm"
            aria-label={activeScene.title}
          >
            <SceneThumbnailContent scene={activeScene} viewportSize={1000} viewportRatio={0.5625} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-12 text-white">
              <p className="font-medium">{activeScene.title}</p>
            </div>
          </section>
        )}
        <div className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPlaying((current) => !current)}
              className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-label={playing ? t('replay.pause') : t('replay.play')}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <span className="w-12 text-sm tabular-nums">{formatTime(position)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, replay.durationMs)}
              value={Math.round(position)}
              onChange={(event) => setPosition(Number(event.target.value))}
              onPointerUp={savePosition}
              className="flex-1"
              aria-label={t('replay.position')}
            />
            <span className="w-12 text-sm tabular-nums">{formatTime(replay.durationMs)}</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t('replay.storageUsed').replace('{{size}}', replay.audioMegabytes.toFixed(2))}
          </p>
          <audio ref={audioRef} className="mt-3 w-full" controls preload="metadata" />
        </div>
        <ol className="mt-6 space-y-3" aria-label={t('replay.timeline')}>
          {visibleEvents.map((event) => {
            const text = typeof event.payload.text === 'string' ? event.payload.text : null;
            return (
              <li key={event.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t(`replay.actor.${event.actor}`)}</span>
                  <span>{formatTime(event.tsMs)}</span>
                </div>
                {text && <p className="mt-2">{text}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
