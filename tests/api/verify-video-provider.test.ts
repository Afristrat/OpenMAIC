import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { testVideoConnectivity, requireAuth } = vi.hoisted(() => ({
  testVideoConnectivity: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth }));

vi.mock('@/lib/media/video-providers', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/media/video-providers')>();
  return { ...original, testVideoConnectivity };
});

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: vi.fn(() => true),
  resolveVideoApiKey: vi.fn((providerId: string) =>
    providerId === 'comfyui-video' ? 'sidecar-secret' : undefined,
  ),
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
    requireAuth.mockReset();
    requireAuth.mockResolvedValue({ user: { id: 'u1', email: 'u1@example.com' } });
    testVideoConnectivity.mockResolvedValue({ success: true, message: 'Connected' });
  });

  it('verifies the managed ComfyUI LTX-2 provider with its server-side secret', async () => {
    const response = await POST(request('comfyui-video'));

    expect(response.status).toBe(200);
    expect(testVideoConnectivity).toHaveBeenCalledWith({
      providerId: 'comfyui-video',
      apiKey: 'sidecar-secret',
      baseUrl: 'http://comfyui.test',
      model: undefined,
    });
  });

  it('rejects an anonymous caller with 401 before any connectivity test', async () => {
    requireAuth.mockResolvedValue({ response: new Response('{}', { status: 401 }) });

    const response = await POST(request('comfyui-video'));

    expect(response.status).toBe(401);
    expect(testVideoConnectivity).not.toHaveBeenCalled();
  });

  it('still rejects a provider that requires an API key', async () => {
    const response = await POST(request('seedance'));

    expect(response.status).toBe(400);
    expect(testVideoConnectivity).not.toHaveBeenCalled();
  });
});
