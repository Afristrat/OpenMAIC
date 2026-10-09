import { describe, expect, it } from 'vitest';
import type { Stage } from '@openmaic/dsl';
import {
  applyInteractiveDesignSystem,
  buildInteractiveDesignTokens,
  INTERACTIVE_DESIGN_PROMPT_MODULE,
  INTERACTIVE_DESIGN_CSS_VARIABLES,
} from '@/lib/branding/interactive-design-system';

const snapshot: Stage['brandSnapshot'] = {
  version: 1,
  createdAt: '2026-10-09T00:00:00.000Z',
  content:
    'colors: background=#F6F9F7; surface=#FFFFFF; ink=#202124; accent=#1A8FC2; muted=#EDF3F5; secondary=#476B8A\nfonts: display=Inter',
};

describe('interactive design system', () => {
  it('keeps the shared prompt module below the 1,500-character budget', () => {
    expect(INTERACTIVE_DESIGN_PROMPT_MODULE.length).toBeLessThanOrEqual(1500);
  });

  it('derives all documented tokens from the immutable tenant snapshot and safe defaults', () => {
    const tokens = buildInteractiveDesignTokens(undefined, snapshot);
    expect(Object.keys(tokens).sort()).toEqual([...INTERACTIVE_DESIGN_CSS_VARIABLES].sort());
    expect(tokens['--q-bg']).toBe('#F6F9F7');
    expect(tokens['--q-accent']).toBe('#1A8FC2');
    expect(tokens['--q-font-heading']).toContain('Inter');
    expect(tokens['--q-font-body']).toContain('system-ui');
    expect(tokens['--q-on-ok']).toMatch(/^#[\da-f]{6}$/iu);
  });

  it('injects a self-contained theme in the document head without external fonts', () => {
    const html = '<!doctype html><html><head></head><body><main>Content</main></body></html>';
    const themed = applyInteractiveDesignSystem(html, undefined, snapshot);

    expect(themed).toContain('<head><style id="qalem-design-tokens">');
    expect(themed).toContain('--q-bg:#F6F9F7');
    expect(themed).toContain('button:focus-visible');
    expect(themed).toContain('min-height:44px');
    expect(themed).not.toMatch(/@import|fonts\.googleapis|fonts\.gstatic/iu);
    expect(applyInteractiveDesignSystem(themed, undefined, snapshot)).toBe(themed);
  });

  it('leaves legacy interactive HTML byte-for-byte unchanged when the design system is off', () => {
    const html = '<!doctype html><html><body><button>Go</button></body></html>';
    expect(applyInteractiveDesignSystem(html, undefined, undefined)).toBe(html);
  });
});
