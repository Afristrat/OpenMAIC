import type { Action, DiscussionAction, SpeechAction } from '@/lib/types/action';
import type { ManifestAction } from './classroom-zip-types';
import { db } from '@/lib/utils/database';
import type { AudioFileRecord, MediaFileRecord } from '@/lib/utils/database';
import type { Scene } from '@/lib/types/stage';

// ─── Export: Collect Media ─────────────────────────────────────

export interface CollectedAudio {
  zipPath: string;
  record: AudioFileRecord;
  sourceUrl?: string;
}

export interface CollectedMedia {
  zipPath: string;
  record: MediaFileRecord;
  elementId: string;
  sourceUrl?: string;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function classroomMediaZipPath(stageId: string, sourceUrl: string): string | null {
  const marker = `/api/classroom-media/${encodeURIComponent(stageId)}/`;
  const pathname = new URL(sourceUrl, 'https://qalem.invalid').pathname;
  const index = pathname.indexOf(marker);
  if (index === -1) return null;

  const path = decodeURIComponent(pathname.slice(index + marker.length));
  return path.startsWith('audio/') || path.startsWith('media/') ? path : null;
}

function extensionFromPath(path: string, fallback: string): string {
  const extension = path.split('/').pop()?.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : fallback;
}

async function downloadServerAsset(
  sourceUrl: string,
  zipPath: string,
  fetchImpl: FetchLike,
): Promise<Blob> {
  const response = await fetchImpl(sourceUrl, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Média persistant indisponible pour l'export (${response.status})`);
  }
  return response.blob();
}

export async function collectAudioFiles(
  scenes: Scene[],
  stageId?: string,
  fetchImpl: FetchLike = fetch,
): Promise<CollectedAudio[]> {
  const audioIds = new Set<string>();
  const audioUrls = new Set<string>();
  for (const scene of scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech') {
        const speech = action as SpeechAction;
        if (speech.audioId) audioIds.add(speech.audioId);
        if (speech.audioUrl) audioUrls.add(speech.audioUrl);
      }
    }
  }
  const collected: CollectedAudio[] = [];
  for (const audioId of audioIds) {
    const record = await db.audioFiles.get(audioId);
    if (record) {
      const ext = record.format || 'mp3';
      collected.push({ zipPath: `audio/${audioId}.${ext}`, record });
    }
  }

  if (!stageId) return collected;

  for (const sourceUrl of audioUrls) {
    const zipPath = classroomMediaZipPath(stageId, sourceUrl);
    if (!zipPath || collected.some((item) => item.zipPath === zipPath)) continue;
    const blob = await downloadServerAsset(sourceUrl, zipPath, fetchImpl);
    collected.push({
      zipPath,
      sourceUrl,
      record: {
        id: `server:${zipPath}`,
        blob,
        format: extensionFromPath(zipPath, 'wav'),
        createdAt: Date.now(),
      },
    });
  }
  return collected;
}

function collectServerMediaUrls(value: unknown, stageId: string, urls: Set<string>): void {
  if (typeof value === 'string') {
    const zipPath = classroomMediaZipPath(stageId, value);
    if (zipPath?.startsWith('media/')) urls.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectServerMediaUrls(item, stageId, urls));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectServerMediaUrls(item, stageId, urls),
    );
  }
}

export async function collectMediaFiles(
  stageId: string,
  scenes: Scene[] = [],
  fetchImpl: FetchLike = fetch,
): Promise<CollectedMedia[]> {
  const records = await db.mediaFiles.where('stageId').equals(stageId).toArray();
  const collected: CollectedMedia[] = [];
  for (const record of records) {
    const elementId = record.id.includes(':') ? record.id.split(':').slice(1).join(':') : record.id;
    const ext = record.mimeType?.split('/')[1] || 'jpg';
    collected.push({ zipPath: `media/${elementId}.${ext}`, record, elementId });
  }

  const serverMediaUrls = new Set<string>();
  scenes.forEach((scene) => collectServerMediaUrls(scene.content, stageId, serverMediaUrls));
  for (const sourceUrl of serverMediaUrls) {
    const zipPath = classroomMediaZipPath(stageId, sourceUrl);
    if (!zipPath || collected.some((item) => item.zipPath === zipPath)) continue;
    const blob = await downloadServerAsset(sourceUrl, zipPath, fetchImpl);
    const mimeType = blob.type || 'application/octet-stream';
    const elementId =
      zipPath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'media';
    collected.push({
      zipPath,
      sourceUrl,
      elementId,
      record: {
        id: `server:${zipPath}`,
        stageId,
        type: mimeType.startsWith('video/') ? 'video' : 'image',
        blob,
        mimeType,
        size: blob.size,
        prompt: '',
        params: '{}',
        createdAt: Date.now(),
      },
    });
  }
  return collected;
}

// ─── Export: Action Serialization ──────────────────────────────

export function actionsToManifest(
  actions: Action[],
  audioIdToPath: Map<string, string>,
  agentIdToIndex: Map<string, number> = new Map(),
  audioUrlToPath: Map<string, string> = new Map(),
): ManifestAction[] {
  return actions.map((action) => {
    if (action.type === 'speech') {
      const speech = action as SpeechAction;
      const { audioId, audioUrl, ...rest } = speech;
      const audioRef = audioId ? audioIdToPath.get(audioId) : audioUrlToPath.get(audioUrl ?? '');
      return {
        ...rest,
        ...(audioRef ? { audioRef } : {}),
        ...(audioRef || !audioUrl ? {} : { audioUrl }),
      } as ManifestAction;
    }
    if (action.type === 'discussion') {
      const discussion = action as DiscussionAction;
      const { agentId, ...rest } = discussion;
      const agentIndex = agentId ? agentIdToIndex.get(agentId) : undefined;
      return {
        ...rest,
        ...(agentIndex !== undefined ? { agentIndex } : agentId ? { agentId } : {}),
      } as ManifestAction;
    }
    return action as ManifestAction;
  });
}

// ─── Import: Reference Rewriting ───────────────────────────────

interface RewriteManifestActionOptions {
  agentIds?: string[];
  fallbackDiscussionAgentIndex?: number;
}

export function rewriteAudioRefsToIds(
  actions: ManifestAction[],
  audioRefMap: Record<string, string>,
  options: RewriteManifestActionOptions = {},
): Action[] {
  return actions.map((action) => {
    if (action.type === 'speech' && 'audioRef' in action) {
      const { audioRef, ...rest } = action;
      const audioId = audioRef ? audioRefMap[audioRef] : undefined;
      return {
        ...rest,
        ...(audioId ? { audioId } : {}),
      } as Action;
    }
    if (action.type === 'discussion') {
      const {
        agentIndex,
        agentId: legacyAgentId,
        ...rest
      } = action as ManifestAction & { type: 'discussion'; agentIndex?: number; agentId?: string };
      const indexedAgentId =
        typeof agentIndex === 'number' ? options.agentIds?.[agentIndex] : undefined;
      const preservedLegacyAgentId =
        legacyAgentId && (!options.agentIds?.length || options.agentIds.includes(legacyAgentId))
          ? legacyAgentId
          : undefined;
      const fallbackAgentId =
        typeof options.fallbackDiscussionAgentIndex === 'number'
          ? options.agentIds?.[options.fallbackDiscussionAgentIndex]
          : undefined;

      return {
        ...rest,
        ...(indexedAgentId || preservedLegacyAgentId || fallbackAgentId
          ? { agentId: indexedAgentId || preservedLegacyAgentId || fallbackAgentId }
          : {}),
      } as Action;
    }
    return action as Action;
  });
}
