import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const testVideoConnectivity = vi.fn();

vi.mock('@/lib/media/video-providers', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/media/video-providers')>();
  return { ...original, testVideoConnectivity };
});

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: vi.fn(() => true),
  resolveVideoApiKey: vi.fn(() => undefined),
  resolveVideoBaseUrl: vi.fn(() => 'http://comfyui.test'),
}));

import { POST } from '@/app/api/verify-video-provider/route';

function request(providerId: string): NextRequest {
  return new NextRequest('http://localhost/api/verify-video-provider', {
    method: 'POST',
    headers: { 'x-video-provider': providerId },
  });
}

describe('verify-video-provider route', () => {
  beforeEach(() => {
    testVideoConnectivity.mockReset();
    testVideoConnectivity.mockResolvedValue({ success: true, message: 'Connected' });
  });

  it('verifies the keyless ComfyUI LTX-2 provider without requiring an API key', async () => {
    const response = await POST(request('comfyui-video'));

    expect(response.status).toBe(200);
    expect(testVideoConnectivity).toHaveBeenCalledWith({
      providerId: 'comfyui-video',
      apiKey: undefined,
      baseUrl: 'http://comfyui.test',
      model: undefined,
    });
  });

  it('still rejects a provider that requires an API key', async () => {
    const response = await POST(request('seedance'));

    expect(response.status).toBe(400);
    expect(testVideoConnectivity).not.toHaveBeenCalled();
  });
});
