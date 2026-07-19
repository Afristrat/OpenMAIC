import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isFeatureEnabled: vi.fn(),
  isHyperframesConfigured: vi.fn(),
  enqueueVideoCapsule: vi.fn(),
  stageSingle: vi.fn(),
  sceneSingle: vi.fn(),
  insertSingle: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock('@/lib/video/hyperframes-client', () => ({
  isHyperframesConfigured: mocks.isHyperframesConfigured,
}));
vi.mock('@/lib/jobs/queue', () => ({ enqueueVideoCapsule: mocks.enqueueVideoCapsule }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: () => mocks.sceneSingle() }),
          single: () => (table === 'stages' ? mocks.stageSingle() : mocks.sceneSingle()),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: () => mocks.insertSingle() }),
      }),
    }),
  }),
}));

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/video-capsules/route');
  const request = new Request('http://localhost/api/video-capsules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

const validBody = {
  stageId: 'stage_1',
  sceneId: 'scene_1',
  audience: 'etudiant',
  tone: 'pedagogique',
  objective: 'awareness',
  durationS: 60,
};

describe('POST /api/video-capsules', () => {
  const originalBrandId = process.env.MISHKAT_BRAND_ID;

  afterEach(() => {
    process.env.MISHKAT_BRAND_ID = originalBrandId;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MISHKAT_BRAND_ID = 'qalem-test-brand';
    mocks.requireAuth.mockResolvedValue({ user: { id: 'user_1', email: 'a@b.com' } });
    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.isHyperframesConfigured.mockReturnValue(true);
    mocks.stageSingle.mockResolvedValue({
      data: { id: 'stage_1', name: 'Cours Test', language: 'fr-FR' },
      error: null,
    });
    mocks.sceneSingle.mockResolvedValue({
      data: { id: 'scene_1', title: 'Scène 1' },
      error: null,
    });
    mocks.insertSingle.mockResolvedValue({
      data: { id: 'capsule_1', status: 'queued' },
      error: null,
    });
    mocks.enqueueVideoCapsule.mockResolvedValue('job_1');
  });

  it('returns 403 when the video_capsules flag is disabled', async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const res = await post(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 501 when Mishkāt is not configured', async () => {
    mocks.isHyperframesConfigured.mockReturnValue(false);
    const res = await post(validBody);
    expect(res.status).toBe(501);
  });

  it('returns 400 when a required field is missing', async () => {
    const res = await post({ stageId: 'stage_1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 before database access when an enum is rejected by Mishkāt', async () => {
    const res = await post({ ...validBody, audience: 'learners' });
    expect(res.status).toBe(400);
    expect(mocks.stageSingle).not.toHaveBeenCalled();
  });

  it('creates a capsule and enqueues the render job on success', async () => {
    const res = await post(validBody);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ success: true, id: 'capsule_1', status: 'queued' });
    expect(mocks.enqueueVideoCapsule).toHaveBeenCalledWith({ capsuleId: 'capsule_1' });
  });

  it('returns 404 when the stage is not found (or not owned by the user)', async () => {
    mocks.stageSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const res = await post(validBody);
    expect(res.status).toBe(404);
  });
});
