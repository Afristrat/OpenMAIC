import { describe, expect, it } from 'vitest';
import { selectRequestImageTarget } from '@/lib/media/image-provider-selection';

// État réel de la production le 12/11 : dgx par défaut (workflow « default »), openai-image géré aussi.
const serverProviders = {
  'openai-image': { models: ['gpt-image-1'] },
  dgx: { models: ['default'] },
};

describe('selectRequestImageTarget', () => {
  it('serves a browser that sends no provider with the server default and its workflow', () => {
    expect(
      selectRequestImageTarget({
        hasClientApiKey: false,
        serverProviders,
        defaultProviderId: 'dgx',
      }),
    ).toEqual({ providerId: 'dgx', modelId: 'default', managed: true });
  });

  it('fills the model a browser left empty for an administered provider', () => {
    expect(
      selectRequestImageTarget({
        requestedProviderId: 'dgx',
        hasClientApiKey: false,
        serverProviders,
        defaultProviderId: 'dgx',
      }),
    ).toEqual({ providerId: 'dgx', modelId: 'default', managed: true });
  });

  it('replaces a stale unconfigured provider without a key by the server default', () => {
    expect(
      selectRequestImageTarget({
        requestedProviderId: 'seedream',
        requestedModelId: 'doubao-seedream-5-0-260128',
        hasClientApiKey: false,
        serverProviders,
        defaultProviderId: 'dgx',
      }),
    ).toEqual({ providerId: 'dgx', modelId: 'default', managed: true });
  });

  it('keeps an administered provider and model chosen by the author', () => {
    expect(
      selectRequestImageTarget({
        requestedProviderId: 'openai-image',
        requestedModelId: 'gpt-image-1',
        hasClientApiKey: false,
        serverProviders,
        defaultProviderId: 'dgx',
      }),
    ).toEqual({ providerId: 'openai-image', modelId: 'gpt-image-1', managed: true });
  });

  it('honours a provider the caller brings with their own key', () => {
    expect(
      selectRequestImageTarget({
        requestedProviderId: 'seedream',
        requestedModelId: 'doubao-seedream-5-0-260128',
        hasClientApiKey: true,
        serverProviders,
        defaultProviderId: 'dgx',
      }),
    ).toEqual({ providerId: 'seedream', modelId: 'doubao-seedream-5-0-260128', managed: false });
  });

  it('keeps the request as sent when the server administers no image provider', () => {
    expect(
      selectRequestImageTarget({
        requestedProviderId: 'seedream',
        hasClientApiKey: false,
        serverProviders: {},
      }),
    ).toEqual({ providerId: 'seedream', modelId: undefined, managed: false });
  });
});
