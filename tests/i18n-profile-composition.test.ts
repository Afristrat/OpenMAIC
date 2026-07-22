import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n';

describe('profile translation composition', () => {
  it('keeps rich-profile keys when settings profile keys are merged', () => {
    expect(translate('en-US', 'profile.richProfile.cultureLabel')).not.toContain(
      'profile.richProfile',
    );
    expect(translate('en-US', 'profile.richProfile.culture.ma-ar')).not.toContain(
      'profile.richProfile',
    );
    expect(translate('fr-FR', 'profile.richProfile.culture.ma-ar')).not.toContain(
      'profile.richProfile',
    );
    expect(translate('ar-MA', 'profile.richProfile.cultureLabel')).not.toContain(
      'profile.richProfile',
    );
  });
});
