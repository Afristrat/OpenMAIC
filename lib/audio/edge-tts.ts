/**
 * Edge TTS — Direct implementation of Microsoft Edge's speech synthesis.
 *
 * Uses the same WebSocket endpoint that Microsoft Edge browser uses internally.
 * Free, no API key required, high-quality neural voices.
 *
 * Protocol: WebSocket to wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
 * with specific headers to identify as Edge browser.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('EdgeTTS');

const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

const EDGE_VOICE_LOCALE = /^([a-z]{2,3}-[A-Z]{2})-/u;

function escapeSsmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolve the BCP-47 locale embedded in every supported Edge voice identifier. */
export function resolveEdgeTTSLocale(voice: string): string {
  return EDGE_VOICE_LOCALE.exec(voice)?.[1] ?? 'fr-FR';
}

export function buildEdgeTTSSsml(text: string, voice: string, speed: number = 1.0): string {
  const locale = resolveEdgeTTSLocale(voice);
  const ratePercent = `${speed >= 1 ? '+' : ''}${Math.round((speed - 1) * 100)}%`;
  const escapedText = escapeSsmlText(text);

  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">`,
    `<voice xml:lang="${locale}" name="${voice}">`,
    `<prosody rate="${ratePercent}">${escapedText}</prosody>`,
    '</voice></speak>',
  ].join('');
}

/**
 * Generate speech audio using Microsoft Edge's free TTS service.
 */
export async function generateEdgeTTSAudio(
  text: string,
  voice: string,
  speed: number = 1.0,
): Promise<{ audio: Uint8Array; format: string }> {
  const ssml = buildEdgeTTSSsml(text, voice, speed);

  // Use the REST-like approach via fetch to the Edge cognitive services endpoint
  // This avoids WebSocket complexity and works in server-side Node.js
  try {
    // The Bing speech synthesis endpoint accepts POST with SSML
    const response = await fetch('https://eastus.api.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        Origin: EDGE_ORIGIN,
      },
      body: ssml,
    });

    if (!response.ok) {
      // Fallback: try the alternative free endpoint
      return await generateEdgeTTSViaAlternative(ssml);
    }

    const buffer = await response.arrayBuffer();
    return { audio: new Uint8Array(buffer), format: 'mp3' };
  } catch (error) {
    log.warn('Primary Edge TTS endpoint failed, trying alternative:', error);
    return await generateEdgeTTSViaAlternative(ssml);
  }
}

/**
 * Alternative: Use the Bing Translate TTS endpoint (no auth needed)
 */
async function generateEdgeTTSViaAlternative(
  ssml: string,
): Promise<{ audio: Uint8Array; format: string }> {
  // Use the free Bing TTS endpoint
  const params = new URLSearchParams({
    trustedclienttoken: '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
  });

  const response = await fetch(
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?${params}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      // Preserve the original locale, speed and escaped narration exactly.
      body: ssml,
    },
  );

  if (!response.ok) {
    throw new Error(`Edge TTS failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return { audio: new Uint8Array(buffer), format: 'mp3' };
}
