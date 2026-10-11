import { beforeEach, describe, expect, it, vi } from 'vitest';

const listLabels = vi.fn();
let providers: Record<string, { models?: string[] }> = { dgx: { models: ['default'] } };

vi.mock('@/lib/media/adapters/dgx-image-adapter', () => ({
  listDgxTxt2ImgModelLabels: (...args: unknown[]) => listLabels(...args),
}));
vi.mock('@/lib/server/provider-config', () => ({
  getServerImageProviders: () => providers,
  resolveImageApiKey: () => 'sidecar-secret',
  resolveImageBaseUrl: () => 'http://dgx.internal:8189',
}));

import {
  getDgxWorkflowLabels,
  resetDgxWorkflowLabelsCache,
} from '@/lib/server/dgx-workflow-labels';

describe('getDgxWorkflowLabels', () => {
  beforeEach(() => {
    listLabels.mockReset();
    resetDgxWorkflowLabelsCache();
    providers = { dgx: { models: ['default'] } };
  });

  it('returns the names reported by the sidecar and caches them', async () => {
    listLabels.mockResolvedValue({ default: 'FLUX.2 Klein 9B' });

    await expect(getDgxWorkflowLabels()).resolves.toEqual({ default: 'FLUX.2 Klein 9B' });
    await getDgxWorkflowLabels();

    expect(listLabels).toHaveBeenCalledTimes(1);
    expect(listLabels).toHaveBeenCalledWith({
      apiKey: 'sidecar-secret',
      baseUrl: 'http://dgx.internal:8189',
    });
  });

  it('does not contact the sidecar when DGX is not configured', async () => {
    providers = { 'openai-image': {} };

    await expect(getDgxWorkflowLabels()).resolves.toEqual({});
    expect(listLabels).not.toHaveBeenCalled();
  });

  it('degrades to no names, without throwing, when the sidecar is unreachable', async () => {
    listLabels.mockRejectedValue(new Error('DGX workflow catalogue failed (403)'));

    await expect(getDgxWorkflowLabels()).resolves.toEqual({});
  });
});
