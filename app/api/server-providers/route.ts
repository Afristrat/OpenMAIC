import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerImageDefaultProviderId,
  getServerVideoProviders,
  getServerWebSearchProviders,
  getParallelSceneConcurrency,
} from '@/lib/server/provider-config';
import { getDgxWorkflowLabels } from '@/lib/server/dgx-workflow-labels';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ServerProviders');

// Provider availability is determined by runtime environment variables injected
// by the deployment platform. Caching this route at build time would expose a
// stale catalogue after an operator changes those variables.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const image = getServerImageProviders();
    const dgx = image.dgx;
    if (dgx) {
      const reported = await getDgxWorkflowLabels();
      const labels = Object.fromEntries(
        (dgx.models ?? []).filter((id) => reported[id]).map((id) => [id, reported[id]]),
      );
      // The sidecar's own model names win over any operator-typed label.
      if (Object.keys(labels).length > 0) {
        image.dgx = { ...dgx, modelLabels: { ...dgx.modelLabels, ...labels } };
      }
    }
    return apiSuccess({
      providers: getServerProviders(),
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image,
      imageDefaultProviderId: getServerImageDefaultProviderId(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
      generation: {
        parallelSceneConcurrency: getParallelSceneConcurrency(),
      },
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
