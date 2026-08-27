import { describe, expect, it } from 'vitest';
import { expectConsoleMessages } from '@/tests/helpers/expected-console';

import { extractHtml } from '@/lib/generation/scene-generator';

describe('interactive HTML extraction', () => {
  it('accepts case-insensitive document tags', () => {
    const response = 'Préambule\n```html\n<!DOCTYPE HTML><HTML><BODY>Simulation</BODY></HTML>\n```';
    expect(extractHtml(response)).toBe('<!DOCTYPE HTML><HTML><BODY>Simulation</BODY></HTML>');
  });

  it('accepts a structured fenced document when only closing markers are omitted', () => {
    const response = '```html\n<!DOCTYPE html><html lang="fr"><body><main>Simulation</main>';
    expect(extractHtml(response)).toBe(
      '<!DOCTYPE html><html lang="fr"><body><main>Simulation</main>',
    );
  });

  it('rejects an arbitrary incomplete code block', () => {
    expectConsoleMessages({
      error: [
        '[ERROR] [Generation] Could not extract HTML from response',
        '[ERROR] [Generation] Response preview: ```html',
      ],
    });
    expect(extractHtml('```html\nconst simulation = true;')).toBeNull();
  });
});
