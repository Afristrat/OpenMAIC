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

  it('shows the classroom logo in place of the organisation logo', () => {
    expect(
      presentationBrandingFromOrganization(
        'https://qalem.ma/api/organizations/o/logo?v=1',
        { presentationBranding: { mode: 'both' } },
        'https://qalem.ma/api/classroom/c/logo?v=2',
      ),
    ).toEqual({ mode: 'both', organizationLogoUrl: 'https://qalem.ma/api/classroom/c/logo?v=2' });
  });

  it('falls back to the organisation logo when the classroom has none', () => {
    expect(
      presentationBrandingFromOrganization(
        'https://qalem.ma/api/organizations/o/logo?v=1',
        {},
        ' ',
      ),
    ).toEqual({
      mode: 'organization',
      organizationLogoUrl: 'https://qalem.ma/api/organizations/o/logo?v=1',
    });
  });

  it.each([
    ['none', 'organization'],
    ['qalem', 'both'],
  ] as const)(
    'keeps a classroom logo visible when the organisation policy is %s',
    (mode, expected) => {
      expect(
        presentationBrandingFromOrganization(
          null,
          { presentationBranding: { mode } },
          'https://qalem.ma/api/classroom/c/logo?v=2',
        ),
      ).toEqual({
        mode: expected,
        organizationLogoUrl: 'https://qalem.ma/api/classroom/c/logo?v=2',
      });
    },
  );

  it('stores only the policy, keeping the mark as an organisation-owned field', () => {
    expect(presentationBrandingSettings('qalem')).toEqual({ mode: 'qalem' });
  });
});
