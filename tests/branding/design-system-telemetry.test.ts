import { describe, expect, it } from 'vitest';
import { designSystemWarningRuleId } from '@/lib/branding/design-system-telemetry';

describe('design system telemetry classification', () => {
  it('classifies font mapping, contrast correction, and invalid colors without storing warning text', () => {
    expect(designSystemWarningRuleId('Charte : police display « Arial » remplacée par Inter.')).toBe(
      'charter_font_mapped',
    );
    expect(
      designSystemWarningRuleId(
        'Charte : contraste insuffisant pour accent ; luminosité ajustée (#FFFFFF → #111111).',
      ),
    ).toBe('charter_contrast_adjusted');
    expect(designSystemWarningRuleId('Charte : couleur invalide ignorée pour accent.')).toBe(
      'charter_invalid_color',
    );
  });

  it('does not classify unrelated warning text', () => {
    expect(designSystemWarningRuleId('Unrelated warning with no charter issue')).toBeNull();
  });
});
