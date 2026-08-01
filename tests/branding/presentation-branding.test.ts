import { describe, expect, it } from 'vitest';
import {
  presentationBrandingFromOrganization,
  presentationBrandingSettings,
} from '@/lib/branding/presentation-branding';

describe('presentationBrandingFromOrganization', () => {
  it('defaults to the organisation mark without inventing a missing logo', () => {
    expect(presentationBrandingFromOrganization(null, {})).toEqual({ mode: 'organization' });
  });

  it('retains a configured organisation logo and supported display policy', () => {
    expect(
      presentationBrandingFromOrganization('https://example.com/brand.svg', {
        presentationBranding: { mode: 'both' },
      }),
    ).toEqual({ mode: 'both', organizationLogoUrl: 'https://example.com/brand.svg' });
  });

  it('fails safely to the default policy when persisted settings are malformed', () => {
    expect(
      presentationBrandingFromOrganization('https://example.com/brand.svg', {
        presentationBranding: { mode: 'untrusted' },
      }),
    ).toEqual({ mode: 'organization', organizationLogoUrl: 'https://example.com/brand.svg' });
  });

  it('stores only the policy, keeping the mark as an organisation-owned field', () => {
    expect(presentationBrandingSettings('qalem')).toEqual({ mode: 'qalem' });
  });
});
