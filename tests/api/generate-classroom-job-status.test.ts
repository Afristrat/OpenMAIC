import { describe, expect, it } from 'vitest';

import { getPublicGenerationFailureCode } from '@/lib/server/classroom-job-public-error';

describe('classroom generation public failure code', () => {
  it('exposes a safe actionable code for enabled media failures', () => {
    expect(
      getPublicGenerationFailureCode(
        'Enabled media generation failed for 1/1 requested files: image:x (provider budget or quota exceeded (HTTP 429)).',
      ),
    ).toBe('MEDIA_PROVIDER_UNAVAILABLE');
  });

  it('does not expose an internal code for unrelated worker errors', () => {
    expect(getPublicGenerationFailureCode('private internal failure detail')).toBeUndefined();
  });
});
