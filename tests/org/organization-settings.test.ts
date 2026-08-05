import { describe, expect, it } from 'vitest';
import { mergeOrganizationSettings } from '@/lib/org/organization-settings';

describe('organization settings merge', () => {
  it('preserves the visual identity when another settings section is saved', () => {
    const brandDesignSystem = { version: 1, sourceUrl: 'https://ai-mpower.com/' };
    expect(
      mergeOrganizationSettings(
        { brandDesignSystem, presentationBranding: { mode: 'organization' } },
        { learningDesign: { interactionLevel: 'immersive' } },
      ),
    ).toEqual({
      brandDesignSystem,
      presentationBranding: { mode: 'organization' },
      learningDesign: { interactionLevel: 'immersive' },
    });
  });

  it('allows the dedicated visual identity route to replace only its section', () => {
    expect(
      mergeOrganizationSettings(
        { brandDesignSystem: { version: 1 }, learningDesign: { expertiseLevel: 'advanced' } },
        { brandDesignSystem: { version: 1, sourceUrl: 'https://example.com/' } },
      ),
    ).toEqual({
      brandDesignSystem: { version: 1, sourceUrl: 'https://example.com/' },
      learningDesign: { expertiseLevel: 'advanced' },
    });
  });
});
