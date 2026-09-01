import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import {
  isServerConfiguredProvider,
  resolveASRApiKey,
  resolveASRBaseUrl,
  resolveASRModel,
} from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { isSupportedASRAudioUpload, normalizeASRLanguage } from '@/lib/audio/asr-utils';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
const log = createLogger('Transcription');

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const formData = await req.formData();
    const audioEntry = formData.get('audio');
    const providerId = formData.get('providerId') as ASRProviderId | null;
    const modelId = formData.get('modelId') as string | null;
    const language = formData.get('language') as string | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;
    const orgId = formData.get('orgId');

    if (typeof orgId !== 'string' || orgId.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Organization is required');
    }
    const auth = await requireSuperAdminOrOrgMember(req, orgId);
    if (auth.response) return auth.response;

    if (!(audioEntry instanceof File)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }
    if (audioEntry.size === 0) {
      return apiError('INVALID_REQUEST', 400, 'Audio file is empty');
    }
    if (!isSupportedASRAudioUpload(audioEntry)) {
      return apiError('INVALID_REQUEST', 400, 'Unsupported audio file');
    }
    const audioFile = audioEntry;

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('openai-whisper' as ASRProviderId);
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = modelId ?? undefined;

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('asr', effectiveProviderId);
    const clientBaseUrl = managed ? undefined : baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      modelId: resolveASRModel(effectiveProviderId, modelId || undefined),
      language: normalizeASRLanguage(language),
      apiKey: resolveASRApiKey(effectiveProviderId, managed ? undefined : apiKey || undefined),
      baseUrl: resolveASRBaseUrl(effectiveProviderId, clientBaseUrl),
    };

    // Transcribe using the provider system
    const result = await transcribeAudio(config, audioFile);

    return apiSuccess({ text: result.text });
  } catch (error) {
    log.error(
      `Transcription failed [provider=${resolvedProviderId ?? 'unknown'}, model=${resolvedModelId ?? 'default'}]:`,
      error,
    );
    return apiError(
      'TRANSCRIPTION_FAILED',
      500,
      'Transcription failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
