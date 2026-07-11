import { describe, expect, it } from 'vitest';
import { renderSceneContent } from '@/lib/export/scorm/scene-to-html';

describe('renderSceneContent', () => {
  it('returns the interactive scene html as-is (already self-contained)', () => {
    const html = renderSceneContent({ type: 'interactive', html: '<p>Hello <b>world</b></p>' });
    expect(html).toBe('<p>Hello <b>world</b></p>');
  });

  it('renders quiz questions and options, escaping question/option text', () => {
    const html = renderSceneContent({
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: 'What is <b>2+2</b>?',
          options: [
            { label: '3', value: 'A' },
            { label: '4', value: 'B' },
          ],
        },
      ],
    });
    expect(html).toContain('What is &lt;b&gt;2+2&lt;/b&gt;?');
    expect(html).toContain('<li>3</li>');
    expect(html).toContain('<li>4</li>');
  });

  it('renders slide text and image elements from the canvas, ignoring unknown element types', () => {
    const html = renderSceneContent({
      type: 'slide',
      canvas: {
        elements: [
          { type: 'text', content: '<p>Titre</p>' },
          { type: 'image', src: 'https://example.com/a.png' },
          { type: 'chart', data: [] },
        ],
      },
    });
    expect(html).toContain('<div class="scorm-slide-text"><p>Titre</p></div>');
    expect(html).toContain('<img class="scorm-slide-image" src="https://example.com/a.png" alt="" />');
    expect(html).not.toContain('chart');
  });

  it('renders a pbl fallback from the project title/description', () => {
    const html = renderSceneContent({
      type: 'pbl',
      projectConfig: { title: 'Projet final', description: 'Construire un pont' },
    });
    expect(html).toContain('<h3>Projet final</h3>');
    expect(html).toContain('<p>Construire un pont</p>');
  });

  it('returns an empty string for unknown or malformed content', () => {
    expect(renderSceneContent(null)).toBe('');
    expect(renderSceneContent(undefined)).toBe('');
    expect(renderSceneContent('not an object')).toBe('');
    expect(renderSceneContent({ type: 'unknown-type' })).toBe('');
  });
});
