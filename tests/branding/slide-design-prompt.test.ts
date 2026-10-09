import { describe, expect, it } from 'vitest';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { DEFAULT_DESIGN_DIRECTIVE } from '@/lib/branding/design-directive';
import { buildSlideDesignPromptContext } from '@/lib/branding/slide-design-prompt';
import type { SceneOutline } from '@/lib/types/generation';

const slide = (id: string, order: number, title: string): SceneOutline => ({
  id,
  order,
  type: 'slide',
  title,
  description: 'Purpose of the slide',
  keyPoints: ['First point'],
});

describe('adaptive slide design prompt context', () => {
  it('preserves the existing prompt path when no design data is supplied', () => {
    const context = buildSlideDesignPromptContext({ outline: slide('one', 1, 'Overview') });
    expect(context.designSystemEnabled).toBe(false);
    expect(context.slideType).toBe('content');
    expect(context.brandSnapshotContext).toBe('No tenant brand snapshot supplied.');
  });

  it('assigns a stable slide function from the ordered course outline', () => {
    const outlines = [
      slide('first', 1, 'Opening'),
      slide('middle', 2, 'Risk comparison'),
      slide('last', 3, 'Next steps'),
    ];
    expect(
      buildSlideDesignPromptContext({ outline: outlines[0], courseOutlines: outlines }).slideType,
    ).toBe('cover');
    expect(
      buildSlideDesignPromptContext({ outline: outlines[1], courseOutlines: outlines }).slideType,
    ).toBe('content');
    expect(
      buildSlideDesignPromptContext({ outline: outlines[2], courseOutlines: outlines }).slideType,
    ).toBe('end');
  });

  it('passes bounded brand data and resolved palette as data, not user instructions', () => {
    const context = buildSlideDesignPromptContext({
      outline: slide('topic', 2, 'Contents'),
      designDirective: DEFAULT_DESIGN_DIRECTIVE,
      brandSnapshot: {
        version: 1,
        createdAt: '2026-10-09T00:00:00.000Z',
        content: 'A'.repeat(1500),
      },
    });

    expect(context.designSystemEnabled).toBe(true);
    expect(context.slideType).toBe('contents');
    const brandData = JSON.parse(context.brandSnapshotContext) as { content: string };
    const designData = JSON.parse(context.designDirectiveContext) as {
      palette: Record<string, string>;
    };
    expect(brandData.content).toHaveLength(1200);
    expect(designData.palette['surface.base']).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('keeps the slide response contract as JSON and activates only for opted-in courses', () => {
    const disabledContext = buildSlideDesignPromptContext({ outline: slide('legacy', 1, 'Legacy') });
    const enabledContext = buildSlideDesignPromptContext({
      outline: slide('new', 1, 'Opening'),
      designDirective: DEFAULT_DESIGN_DIRECTIVE,
    });
    const disabled = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
      canvas_width: 1000,
      canvas_height: 562.5,
      ...disabledContext,
    });
    const enabled = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
      canvas_width: 1000,
      canvas_height: 562.5,
      ...enabledContext,
    });

    expect(disabled?.system).not.toContain('Adaptive Visual Design Contract');
    expect(enabled?.system).toContain('Adaptive Visual Design Contract');
    expect(enabled?.system).not.toMatch(/\{\{(?:designSystemEnabled|slideType|designDirectiveContext|brandSnapshotContext)/u);
    expect(enabled?.system.length).toBeLessThan(disabled!.system.length + 3000);
    expect(enabled?.user).toContain('Output pure JSON directly');
  });
});
