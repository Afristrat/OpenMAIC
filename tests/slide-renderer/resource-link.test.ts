import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BaseTextElement } from '@/components/slide-renderer/components/element/TextElement/BaseTextElement';
import type { PPTTextElement } from '@openmaic/dsl';

const element: PPTTextElement = {
  id: 'resource-link',
  type: 'text',
  left: 10,
  top: 10,
  width: 300,
  height: 100,
  rotate: 0,
  content: '<p>https://qalem.ma/A7bK2</p>',
  defaultFontName: 'Inter',
  defaultColor: '#111111',
  link: { type: 'web', target: 'https://qalem.ma/A7bK2' },
};

describe('read-only resource link rendering', () => {
  it('renders a trusted web link as a clickable accessible anchor', () => {
    const html = renderToStaticMarkup(createElement(BaseTextElement, { elementInfo: element }));

    expect(html).toContain('href="https://qalem.ma/A7bK2"');
    expect(html).toContain('aria-label="https://qalem.ma/A7bK2"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('does not make thumbnail links interactive', () => {
    const html = renderToStaticMarkup(
      createElement(BaseTextElement, { elementInfo: element, target: 'thumbnail' }),
    );

    expect(html).not.toContain('<a');
  });
});
