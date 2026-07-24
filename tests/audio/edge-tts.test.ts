import { describe, expect, it } from 'vitest';
import { buildEdgeTTSSsml, resolveEdgeTTSLocale } from '@/lib/audio/edge-tts';

describe('Edge TTS SSML', () => {
  it.each([
    ['fr-FR-DeniseNeural', 'fr-FR'],
    ['ar-MA-MounaNeural', 'ar-MA'],
    ['ar-SA-ZariyahNeural', 'ar-SA'],
    ['en-GB-SoniaNeural', 'en-GB'],
  ])('derives %s locale from its voice identifier', (voice, locale) => {
    expect(resolveEdgeTTSLocale(voice)).toBe(locale);
  });

  it('uses the voice locale in both SSML elements and escapes input once', () => {
    expect(buildEdgeTTSSsml('Conseil & <action>', 'ar-MA-MounaNeural', 1.2)).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-MA"><voice xml:lang="ar-MA" name="ar-MA-MounaNeural"><prosody rate="+20%">Conseil &amp; &lt;action&gt;</prosody></voice></speak>',
    );
  });

  it('falls back to the Qalem French locale only for an invalid voice identifier', () => {
    expect(resolveEdgeTTSLocale('unknown')).toBe('fr-FR');
  });
});
