import { describe, expect, it } from 'vitest';
import { organizationPatchSchema } from '@/lib/api/schemas';

describe('organization metadata schema', () => {
  it('accepts a tenant-defined sector instead of imposing the initial catalogue', () => {
    expect(organizationPatchSchema.safeParse({ sector: 'économie sociale' }).success).toBe(true);
  });

  it.each(['fr-CA', 'en-CA', 'iu-Cans-CA'])('accepts the BCP 47 locale %s', (default_locale) => {
    expect(organizationPatchSchema.safeParse({ default_locale }).success).toBe(true);
  });

  it.each(['canadien', 'fr_CA', ''])('rejects the malformed locale %s', (default_locale) => {
    expect(organizationPatchSchema.safeParse({ default_locale }).success).toBe(false);
  });
});
