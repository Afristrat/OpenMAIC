import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createServiceClient: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceClient,
}));

import { privateArtifactUrl, publicArtifactUrl } from '@/lib/server/private-artifact-url';

describe('publicArtifactUrl', () => {
  const publicUrl = 'https://db.qalem.ma';
  const internalUrl = 'http://qalem-internal-kong:8000';

  it('rewrites an internally signed URL to the public Supabase origin', () => {
    expect(
      publicArtifactUrl(
        'http://qalem-internal-kong:8000/storage/v1/object/sign/exports/course/file.zip?token=signed',
        publicUrl,
        internalUrl,
      ),
    ).toBe('https://db.qalem.ma/storage/v1/object/sign/exports/course/file.zip?token=signed');
  });

  it('keeps an already public URL unchanged', () => {
    const signedUrl = 'https://db.qalem.ma/storage/v1/object/sign/exports/course/file.zip?token=signed';
    expect(publicArtifactUrl(signedUrl, publicUrl, internalUrl)).toBe(signedUrl);
  });

  it('rejects a signed URL from an unrelated origin', () => {
    expect(() =>
      publicArtifactUrl(
        'https://untrusted.example/storage/v1/object/sign/exports/course/file.zip?token=signed',
        publicUrl,
        internalUrl,
      ),
    ).toThrow('Invalid storage origin');
  });

  it('uses its own bounded signal instead of an incoming request lifecycle', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', publicUrl);
    vi.stubEnv('SUPABASE_INTERNAL_URL', internalUrl);
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl:
          'http://qalem-internal-kong:8000/storage/v1/object/sign/exports/course/file.zip?token=signed',
      },
      error: null,
    });
    mocks.createServiceClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    });

    await expect(privateArtifactUrl('exports', 'course/file.zip', true)).resolves.toContain(
      'https://db.qalem.ma/storage/v1/object/sign/exports/course/file.zip',
    );
    expect(mocks.createServiceClient).toHaveBeenCalledOnce();
    const [signal] = mocks.createServiceClient.mock.calls[0];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
