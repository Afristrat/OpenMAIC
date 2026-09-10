import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  transmission: vi.fn(),
  sign: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.transmission }) }) }),
  }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  }),
}));

async function getContent() {
  const { GET } = await import('@/app/api/transmissions/[id]/content/route');
  return GET(new NextRequest('https://qalem.ma/api/transmissions/tx_1/content'), {
    params: Promise.resolve({ id: 'tx_1' }),
  });
}

describe('GET /api/transmissions/[id]/content', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    mocks.user.mockResolvedValue({ data: { user: { id: 'recipient_1' } } });
    mocks.transmission.mockResolvedValue({
      data: {
        id: 'tx_1',
        status: 'done',
        source_artifact_path: 'tx_1/source.mp4',
        visual_watermark_path: 'tx_1/visual-watermark.mp4',
      },
      error: null,
    });
    mocks.sign.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/visual-watermark.mp4' },
      error: null,
    });
  });

  it('delivers only the visual watermark derivative without buffering the source', async () => {
    const response = await getContent();

    expect(response.status).toBe(307);
    expect(await response.text()).toBe('');
    expect(mocks.sign).toHaveBeenCalledWith('tx_1/visual-watermark.mp4', 60, { download: false });
  });

  it('refuses to expose a completed-looking source without its visual derivative', async () => {
    mocks.transmission.mockResolvedValue({
      data: {
        status: 'done',
        source_artifact_path: 'tx_1/source.mp4',
        visual_watermark_path: null,
      },
      error: null,
    });

    const response = await getContent();

    expect(response.status).toBe(409);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
