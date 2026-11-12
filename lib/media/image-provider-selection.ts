import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import type { ImageProviderId } from '@/lib/media/types';

/**
 * Single rule, shared by the editor's image button and classroom generation, for
 * choosing which administered image provider and model serve a request. A browser
 * may hold stale settings (an unconfigured default such as `seedream`, an empty
 * model): the server's own configuration must win over them.
 */

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
  defaultProviderId?: string,
): ImageProviderId | undefined {
  if (requestedProviderId && requestedProviderId in serverProviders) {
    return requestedProviderId as ImageProviderId;
  }
  if (defaultProviderId && defaultProviderId in serverProviders) {
    return defaultProviderId as ImageProviderId;
  }
  return Object.keys(serverProviders)[0] as ImageProviderId | undefined;
}

/**
 * Resolves the provider and model of an editor image request. A provider the
 * caller brings with their own key (`x-api-key`) is honoured as sent; otherwise
 * the request is served by an administered provider, the server default first.
 */
export function selectRequestImageTarget(input: {
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly hasClientApiKey: boolean;
  readonly serverProviders: Record<string, { models?: string[] }>;
  readonly defaultProviderId?: string;
}): { providerId: ImageProviderId; modelId?: string; managed: boolean } {
  const { requestedProviderId, requestedModelId, serverProviders } = input;
  const requestedIsManaged = !!requestedProviderId && requestedProviderId in serverProviders;
  if (requestedProviderId && !requestedIsManaged && input.hasClientApiKey) {
    return {
      providerId: requestedProviderId as ImageProviderId,
      modelId: requestedModelId,
      managed: false,
    };
  }
  const managedProvider = selectClassroomImageProvider(
    serverProviders,
    requestedProviderId,
    input.defaultProviderId,
  );
  if (!managedProvider) {
    // Nothing administered: keep the caller's choice so the route can explain what is missing.
    return {
      providerId: (requestedProviderId || 'seedream') as ImageProviderId,
      modelId: requestedModelId,
      managed: false,
    };
  }
  return {
    providerId: managedProvider,
    modelId: selectClassroomImageModel(managedProvider, serverProviders, requestedModelId),
    managed: true,
  };
}
