import { describe, expect, it } from 'vitest';
import { publicArtifactUrl } from '@/lib/server/private-artifact-url';

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
});
