import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  transmission: vi.fn(),
  download: vi.fn(),
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
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

async function getContent() {
  const { GET } = await import('@/app/api/transmissions/[id]/content/route');
  return GET(new Request('https://qalem.ma/api/transmissions/tx_1/content') as NextRequest, {
    params: Promise.resolve({ id: 'tx_1' }),
  });
}

describe('GET /api/transmissions/[id]/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'recipient_1' } } });
    mocks.transmission.mockResolvedValue({
      data: {
        status: 'done',
        source_artifact_path: 'tx_1/source.mp4',
        visual_watermark_path: 'tx_1/visual-watermark.mp4',
      },
      error: null,
    });
    mocks.download.mockResolvedValue({
      data: new Blob(['visual-watermark'], { type: 'video/mp4' }),
      error: null,
    });
  });

  it('streams only the visual watermark derivative, never the source artifact', async () => {
    const response = await getContent();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toBe('inline');
    expect(mocks.download).toHaveBeenCalledWith('tx_1/visual-watermark.mp4');
    expect(mocks.download).not.toHaveBeenCalledWith('tx_1/source.mp4');
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
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
