import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n';

describe('MIT-based Qalem locale catalogs', () => {
  it('keeps both a group label and its dotted child labels addressable', () => {
    expect(translate('en-US', 'org.visibility')).not.toBe('org.visibility');
    expect(translate('en-US', 'org.visibility.organization')).not.toBe(
      'org.visibility.organization',
    );
    expect(translate('fr-FR', 'org.visibility.organization')).not.toBe(
      'org.visibility.organization',
    );
    expect(translate('ar-MA', 'org.visibility.organization')).not.toBe(
      'org.visibility.organization',
    );
  });

  it('uses freshly authored copy for the six keys absent from the MIT baseline', () => {
    for (const key of [
      'home.greeting',
      'pbl.chat.welcomeMessage',
      'settings.maxTurns',
      'settings.maxTurnsDesc',
      'settings.selectModel',
      'toolbar.languageHint',
    ]) {
      expect(translate('en-US', key)).not.toBe(key);
      expect(translate('fr-FR', key)).not.toBe(key);
      expect(translate('ar-MA', key)).not.toBe(key);
    }
  });

  it('interpolates normalized i18next placeholders', () => {
    expect(translate('fr-FR', 'org.sceneCount', { count: 3 })).toContain('3');
  });

  it('localizes v0.3 namespaces in French', () => {
    expect(translate('fr-FR', 'pbl.v2.hero.title')).not.toBe('pbl.v2.hero.title');
  });
});
