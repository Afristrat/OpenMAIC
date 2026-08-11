/**
 * Server-side media and TTS generation for classrooms.
 *
 * Generates image/video files and TTS audio for a classroom,
 * stores them in Supabase Storage, and returns serving URL mappings.
 */

import path from 'path';
import { createHash } from 'node:crypto';
import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { classroomMediaContentType } from '@/lib/server/classroom-storage';
import { generateImage } from '@/lib/media/image-providers';
import { generateVideo, normalizeVideoOptions } from '@/lib/media/video-providers';
import { generateTTS } from '@/lib/audio/tts-providers';
import { DEFAULT_TTS_VOICES, DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { isMediaPlaceholder } from '@/lib/store/media-generation';
import {
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
  resolveImageApiKey,
  resolveImageBaseUrl,
  resolveVideoApiKey,
  resolveVideoBaseUrl,
  resolveTTSApiKey,
  resolveTTSBaseUrl,
} from '@/lib/server/provider-config';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import type { ImageProviderId } from '@/lib/media/types';
import type { VideoProviderId } from '@/lib/media/types';
import type { TTSProviderId } from '@/lib/audio/types';
import { splitLongSpeechActions, splitSpeechActionsByAnglicisms } from '@/lib/audio/tts-utils';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@/lib/audio/voxcpm';
import {
  buildOrganizationImagePrompt,
  type OrganizationDesignSystem,
} from '@/lib/branding/organization-design-system';
import { withGenerationRetry } from '@/lib/generation/generation-retry';
import { ClassroomCastingError } from '@/lib/agents/classroom-casting';

const log = createLogger('ClassroomMedia');

export interface ClassroomTTSGenerationReport {
  requested: number;
  generated: number;
}

export interface CanonicalSpeechAgentVoice {
  id: string;
  name?: string;
  voiceConfig?: { providerId: string; modelId?: string; voiceId: string };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function removeAgentNamesFromSpeech(
  text: string,
  agents: CanonicalSpeechAgentVoice[] = [],
): string {
  const names = [
    ...new Set(
      agents.map((agent) => agent.name?.trim()).filter((name): name is string => Boolean(name)),
    ),
  ].sort((a, b) => b.length - a.length);
  if (names.length === 0) return text;

  const namesPattern = names.map(escapeRegExp).join('|');
  const selfIntroduction = new RegExp(
    `\\b(?:je suis|moi[,]? c['’]est|mon nom est)\\s+(?:${namesPattern})(?=$|[^\\p{L}\\p{N}])[,;:]?\\s*(?:et\\s+)?`,
    'giu',
  );
  const directAddress = new RegExp(`([,;:]?\\s*)(?:${namesPattern})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  const sanitized = text
    .replace(selfIntroduction, '')
    .replace(directAddress, '')
    .replace(/^\s*[,;:.!?]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return sanitized.replace(
    /(^|[.!?]\s+)(\p{Ll})/gu,
    (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('fr-FR'),
  );
}

export function resolveCanonicalSpeechVoice(
  action: SpeechAction,
  preferredVoice: { providerId: string; voiceId: string } | undefined,
  agents: CanonicalSpeechAgentVoice[] = [],
): { providerId: string; voiceId: string } | undefined {
  if (agents.length === 0) return preferredVoice;
  if (!action.agentId) {
    throw new ClassroomCastingError(
      `La prise de parole ${action.id} ne référence aucun agent du casting.`,
    );
  }
  const agent = agents.find((candidate) => candidate.id === action.agentId);
  if (!agent) {
    throw new ClassroomCastingError(
      `La prise de parole ${action.id} référence l’agent inconnu ${action.agentId}.`,
    );
  }
  if (!agent.voiceConfig) {
    throw new ClassroomCastingError(`L’agent ${agent.id} ne possède aucune voix persistante.`);
  }
  return {
    providerId: agent.voiceConfig.providerId,
    voiceId: agent.voiceConfig.voiceId,
  };
}

export function selectClassroomImageModel(
  providerId: ImageProviderId,
  serverProviders: Record<string, { models?: string[] }>,
  requestedModelId?: string,
): string | undefined {
  const administeredModels = serverProviders[providerId]?.models ?? [];
  if (requestedModelId && administeredModels.includes(requestedModelId)) {
    return requestedModelId;
  }
  return administeredModels[0] ?? IMAGE_PROVIDERS[providerId]?.models?.[0]?.id;
}

export function selectClassroomImageProvider(
  serverProviders: Record<string, { models?: string[] }>,
  requestedProviderId?: string,
): ImageProviderId | undefined {
  if (requestedProviderId && requestedProviderId in serverProviders) {
    return requestedProviderId as ImageProviderId;
  }
  return Object.keys(serverProviders)[0] as ImageProviderId | undefined;
}

export function describeMediaProviderFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b429\b|budget|quota|rate.?limit/i.test(message)) {
    return 'provider budget or quota exceeded (HTTP 429)';
  }
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(message)) {
    return 'provider authentication rejected';
  }
  if (/timeout|timed out|abort/i.test(message)) return 'provider request timed out';
  return 'provider request failed';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function uploadClassroomMedia(
  classroomId: string,
  subPath: string,
  buf: Buffer | Uint8Array,
): Promise<void> {
  await withGenerationRetry(
    async () => {
      const supabase = createServiceSupabaseClient();
      const { error } = await supabase.storage
        .from('classroom-media')
        .upload(`${classroomId}/${subPath}`, buf, {
          contentType: classroomMediaContentType(subPath),
          upsert: true,
        });
      if (error) {
        throw new Error(`Failed to upload classroom media ${subPath}: ${error.message}`, {
          cause: error,
        });
      }
    },
    {
      label: `classroom media upload ${subPath}`,
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 4_000,
      onRetry: ({ attempt, maxAttempts, reason }) => {
        log.warn(
          `Retrying classroom media upload ${subPath} (${attempt + 1}/${maxAttempts}): ${reason}`,
        );
      },
    },
  );
}

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 minutes
const DOWNLOAD_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

async function downloadToBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (contentLength > DOWNLOAD_MAX_SIZE) {
    throw new Error(`File too large: ${contentLength} bytes (max ${DOWNLOAD_MAX_SIZE})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function mediaServingUrl(classroomId: string, subPath: string): string {
  // Relative on purpose: an absolute URL bakes in the domain the request
  // arrived on at generation time, which breaks playback if the classroom
  // is later viewed from a different domain (preprod/prod split, domain
  // migration). The browser resolves a relative src against whatever
  // origin is currently serving the page.
  return `/api/classroom-media/${classroomId}/${subPath}`;
}

// ---------------------------------------------------------------------------
// Image / Video generation
// ---------------------------------------------------------------------------

export async function generateMediaForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  designSystem?: OrganizationDesignSystem,
  imageSelection?: { providerId?: string; modelId?: string },
): Promise<Record<string, string>> {
  // Collect all media generation requests from outlines
  const requests = outlines.flatMap((o) => o.mediaGenerations ?? []);
  if (requests.length === 0) return {};

  // Resolve providers
  const serverImageProviders = getServerImageProviders();
  const imageProviderId = selectClassroomImageProvider(
    serverImageProviders,
    imageSelection?.providerId,
  );
  const videoProviderIds = Object.keys(getServerVideoProviders());

  const mediaMap: Record<string, string> = {};
  const failures: Array<{ type: 'image' | 'video'; elementId: string; reason: string }> = [];

  // Separate image and video requests, generate each type sequentially
  // but run the two types in parallel (providers often have limited concurrency).
  const imageRequests = requests.filter((r) => r.type === 'image' && imageProviderId);
  const videoRequests = requests.filter((r) => r.type === 'video' && videoProviderIds.length > 0);

  const generateImages = async () => {
    for (const req of imageRequests) {
      try {
        const providerId = imageProviderId!;
        const apiKey = resolveImageApiKey(providerId);
        const providerConfig = IMAGE_PROVIDERS[providerId];
        if (providerConfig?.requiresApiKey && !apiKey) {
          log.warn(`No API key for image provider "${providerId}", skipping ${req.elementId}`);
          continue;
        }
        const model = selectClassroomImageModel(
          providerId,
          serverImageProviders,
          imageSelection?.modelId,
        );

        const result = await generateImage(
          { providerId, apiKey, baseUrl: resolveImageBaseUrl(providerId), model },
          {
            prompt: buildOrganizationImagePrompt(req.prompt, designSystem),
            aspectRatio: req.aspectRatio || '16:9',
          },
        );

        let buf: Buffer;
        let ext: string;
        if (result.base64) {
          buf = Buffer.from(result.base64, 'base64');
          ext = 'png';
        } else if (result.url) {
          buf = await downloadToBuffer(result.url);
          const urlExt = path.extname(new URL(result.url).pathname).replace('.', '');
          ext = ['png', 'jpg', 'jpeg', 'webp'].includes(urlExt) ? urlExt : 'png';
        } else {
          log.warn(`Image generation returned no data for ${req.elementId}`);
          continue;
        }

        const filename = `${req.elementId}.${ext}`;
        await uploadClassroomMedia(classroomId, `media/${filename}`, buf);
        mediaMap[req.elementId] = mediaServingUrl(classroomId, `media/${filename}`);
        log.info(`Generated image: ${filename}`);
      } catch (err) {
        log.warn(`Image generation failed for ${req.elementId}:`, err);
        failures.push({
          type: 'image',
          elementId: req.elementId,
          reason: describeMediaProviderFailure(err),
        });
      }
    }
  };

  const generateVideos = async () => {
    for (const req of videoRequests) {
      try {
        const providerId = videoProviderIds[0] as VideoProviderId;
        const apiKey = resolveVideoApiKey(providerId);
        const providerConfig = VIDEO_PROVIDERS[providerId];
        if (providerConfig?.requiresApiKey && !apiKey) {
          log.warn(`No API key for video provider "${providerId}", skipping ${req.elementId}`);
          continue;
        }
        const model = providerConfig?.models?.[0]?.id;

        const normalized = normalizeVideoOptions(providerId, {
          prompt: req.prompt,
          aspectRatio: (req.aspectRatio as '16:9' | '4:3' | '1:1' | '9:16') || '16:9',
        });

        const result = await generateVideo(
          { providerId, apiKey, baseUrl: resolveVideoBaseUrl(providerId), model },
          normalized,
        );

        const buf = await downloadToBuffer(result.url);
        const filename = `${req.elementId}.mp4`;
        await uploadClassroomMedia(classroomId, `media/${filename}`, buf);
        mediaMap[req.elementId] = mediaServingUrl(classroomId, `media/${filename}`);
        log.info(`Generated video: ${filename}`);
      } catch (err) {
        log.warn(`Video generation failed for ${req.elementId}:`, err);
        failures.push({
          type: 'video',
          elementId: req.elementId,
          reason: describeMediaProviderFailure(err),
        });
      }
    }
  };

  await Promise.all([generateImages(), generateVideos()]);

  if (failures.length > 0) {
    const summary = failures
      .map((failure) => `${failure.type}:${failure.elementId} (${failure.reason})`)
      .join(', ');
    throw new Error(
      `Enabled media generation failed for ${failures.length}/${requests.length} requested files: ${summary}. Disable the failing media capability or ask its administrator to restore provider capacity.`,
    );
  }

  return mediaMap;
}

// ---------------------------------------------------------------------------
// Placeholder replacement in scene content
// ---------------------------------------------------------------------------

export function replaceMediaPlaceholders(scenes: Scene[], mediaMap: Record<string, string>): void {
  if (Object.keys(mediaMap).length === 0) return;

  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (
      scene.content as {
        canvas?: {
          elements?: Array<{ id: string; src?: string; mediaRef?: string; type?: string }>;
        };
      }
    )?.canvas;
    if (!canvas?.elements) continue;

    for (const el of canvas.elements) {
      if (
        el.type === 'video' &&
        typeof el.mediaRef === 'string' &&
        mediaMap[el.mediaRef] &&
        (!el.src || isMediaPlaceholder(el.src))
      ) {
        el.src = mediaMap[el.mediaRef];
        continue;
      }
      if (
        (el.type === 'image' || el.type === 'video') &&
        typeof el.src === 'string' &&
        isMediaPlaceholder(el.src) &&
        mediaMap[el.src]
      ) {
        el.src = mediaMap[el.src];
      }
    }
  }
}

/**
 * A provider outage or exhausted budget must not destroy an otherwise usable
 * classroom. Remove only unresolved generated-media placeholders; real source
 * images and already persisted media remain untouched.
 */
export function removeUnresolvedMediaPlaceholders(
  scenes: Scene[],
  unresolvedIds: ReadonlySet<string>,
): void {
  if (unresolvedIds.size === 0) return;
  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    const canvas = (
      scene.content as {
        canvas?: {
          elements?: Array<{ src?: string; mediaRef?: string; type?: string }>;
        };
      }
    )?.canvas;
    if (!canvas?.elements) continue;
    canvas.elements = canvas.elements.filter((element) => {
      if (element.type !== 'image' && element.type !== 'video') return true;
      return !(
        (typeof element.src === 'string' && unresolvedIds.has(element.src)) ||
        (typeof element.mediaRef === 'string' && unresolvedIds.has(element.mediaRef))
      );
    });
  }
}

// ---------------------------------------------------------------------------
// TTS generation
// ---------------------------------------------------------------------------

export async function generateTTSForClassroom(
  scenes: Scene[],
  classroomId: string,
  preferredVoice?: { providerId: string; voiceId: string },
  agents: CanonicalSpeechAgentVoice[] = [],
  onProgress?: (progress: { completed: number; total: number }) => Promise<void> | void,
): Promise<ClassroomTTSGenerationReport> {
  const report: ClassroomTTSGenerationReport = { requested: 0, generated: 0 };
  // Resolve TTS provider (exclude browser-native-tts and operator force-disabled
  // providers — server precedence, #665).
  const ttsProviderIds = Object.entries(getServerTTSProviders())
    .filter(([id, info]) => id !== 'browser-native-tts' && !info.disabled)
    .map(([id]) => id);
  if (ttsProviderIds.length === 0) {
    log.warn('No server TTS provider configured, skipping TTS generation');
    return report;
  }

  // VoxCPM's automatic voice needs per-agent reference audio, which this
  // batch pipeline does not receive. Prefer the first server provider that
  // can synthesize autonomously instead of selecting VoxCPM and abandoning
  // the whole classroom while another configured provider is available.
  const preferredProvider =
    preferredVoice && ttsProviderIds.includes(preferredVoice.providerId)
      ? preferredVoice.providerId
      : undefined;
  const providerId = (preferredProvider ??
    ttsProviderIds.find(
      (id) =>
        id !== VOXCPM_TTS_PROVIDER_ID ||
        DEFAULT_TTS_VOICES[id as keyof typeof DEFAULT_TTS_VOICES] !== VOXCPM_AUTO_VOICE_ID,
    )) as TTSProviderId | undefined;
  if (!providerId) {
    log.warn('No server TTS provider supports context-free classroom generation');
    return report;
  }
  for (const scene of scenes) {
    if (!scene.actions) continue;

    // Split with the provider that will actually speak each line. The spread-based
    // splitters preserve agent and intervention identity on every resulting segment.
    scene.actions = scene.actions.flatMap((action) => {
      if (action.type !== 'speech') return [action];
      const speechWithoutAgentNames = {
        ...action,
        text: removeAgentNamesFromSpeech(action.text, agents),
      };
      const requestedVoice = resolveCanonicalSpeechVoice(
        speechWithoutAgentNames,
        preferredVoice,
        agents,
      );
      const actionProviderId = (
        requestedVoice && ttsProviderIds.includes(requestedVoice.providerId)
          ? requestedVoice.providerId
          : providerId
      ) as TTSProviderId;
      return splitSpeechActionsByAnglicisms(
        splitLongSpeechActions([speechWithoutAgentNames], actionProviderId),
        actionProviderId,
      );
    });
  }

  const totalSpeechActions = scenes.reduce(
    (total, scene) =>
      total +
      (scene.actions?.filter(
        (action) => action.type === 'speech' && Boolean((action as SpeechAction).text),
      ).length ?? 0),
    0,
  );

  for (const scene of scenes) {
    if (!scene.actions) continue;

    // Use scene order to make audio IDs unique across scenes
    const sceneOrder = scene.order;

    for (const action of scene.actions) {
      if (action.type !== 'speech' || !(action as SpeechAction).text) continue;
      const speechAction = action as SpeechAction;
      report.requested += 1;
      // Include scene order in audioId to prevent collision across scenes
      const audioId = `tts_s${sceneOrder}_${action.id}`;

      try {
        const requestedVoice = resolveCanonicalSpeechVoice(speechAction, preferredVoice, agents);
        const actionProviderId = (
          requestedVoice && ttsProviderIds.includes(requestedVoice.providerId)
            ? requestedVoice.providerId
            : providerId
        ) as TTSProviderId;
        const actionProvider = TTS_PROVIDERS[actionProviderId as keyof typeof TTS_PROVIDERS];
        const apiKey = resolveTTSApiKey(actionProviderId);
        if (actionProvider?.requiresApiKey && !apiKey) {
          throw new Error(`No API key configured for TTS provider "${actionProviderId}"`);
        }
        const ttsBaseUrl = resolveTTSBaseUrl(actionProviderId) || actionProvider?.defaultBaseUrl;
        const voice =
          requestedVoice?.providerId === actionProviderId
            ? requestedVoice.voiceId
            : DEFAULT_TTS_VOICES[actionProviderId as keyof typeof DEFAULT_TTS_VOICES] || 'default';
        const format = actionProvider?.supportedFormats?.[0] || 'mp3';
        const result = await generateTTS(
          {
            providerId: actionProviderId,
            modelId:
              agents.find((agent) => agent.id === speechAction.agentId)?.voiceConfig?.modelId ||
              DEFAULT_TTS_MODELS[actionProviderId as keyof typeof DEFAULT_TTS_MODELS] ||
              '',
            apiKey,
            baseUrl: ttsBaseUrl,
            voice,
            speed: speechAction.speed,
            language: speechAction.ttsLanguageOverride,
          },
          speechAction.text,
        );

        const filename = `${audioId}.${result.format || format}`;
        await uploadClassroomMedia(classroomId, `audio/${filename}`, result.audio);
        const audioVersion = createHash('sha256').update(result.audio).digest('hex').slice(0, 12);

        speechAction.audioId = audioId;
        speechAction.audioUrl = `${mediaServingUrl(classroomId, `audio/${filename}`)}?v=${audioVersion}`;
        report.generated += 1;
        log.info(`Generated TTS: ${filename} (${result.audio.length} bytes)`);
        await onProgress?.({ completed: report.generated, total: totalSpeechActions });
      } catch (err) {
        log.warn(`TTS generation failed for action ${action.id}:`, err);
      }
    }
  }
  return report;
}
