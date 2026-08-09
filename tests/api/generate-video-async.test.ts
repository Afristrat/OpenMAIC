import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  enqueueVideoGeneration: vi.fn(),
  generateVideo: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'user-1', email: 'owner@example.com' } })),
}));

vi.mock('@/lib/jobs/queue', () => ({
  enqueueVideoGeneration: mocks.enqueueVideoGeneration,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: vi.fn(() => true),
  resolveVideoApiKey: vi.fn(() => 'sidecar-secret'),
  resolveVideoBaseUrl: vi.fn(),
}));

vi.mock('@/lib/media/video-providers', () => ({
  VIDEO_PROVIDERS: { 'comfyui-video': { requiresApiKey: true } },
  generateVideo: mocks.generateVideo,
  normalizeVideoOptions: vi.fn((_providerId, options) => options),
}));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: vi.fn() }));

import { POST } from '@/app/api/generate/video/route';

describe('managed video generation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.single.mockResolvedValue({
      data: { id: 'job-1', status: 'queued' },
      error: null,
    });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.enqueueVideoGeneration.mockResolvedValue('bull-job-1');
  });

  it('returns immediately and enqueues a managed LTX-2 render', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate/video', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-video-provider': 'comfyui-video',
          'x-video-model': 'ltx-2-video',
        },
        body: JSON.stringify({ prompt: 'A generative motion study', duration: 2 }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      id: 'job-1',
      status: 'queued',
      pollIntervalMs: 3000,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: 'user-1',
        provider_id: 'comfyui-video',
        model_id: 'ltx-2-video',
        status: 'queued',
      }),
    );
    expect(mocks.enqueueVideoGeneration).toHaveBeenCalledWith({
      videoGenerationJobId: 'job-1',
    });
    expect(mocks.generateVideo).not.toHaveBeenCalled();
  });
});
