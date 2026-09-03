import { describe, expect, it } from 'vitest';
import { renderSceneContent } from '@/lib/export/scorm/scene-to-html';

describe('renderSceneContent', () => {
  it('renders an honest static-widget notice without embedding executable HTML', () => {
    const html = renderSceneContent({
      type: 'interactive',
      html: '<script>window.liveQalem = true</script>',
    });
    expect(html).toContain('capture statique');
    expect(html).not.toContain('window.liveQalem');
    expect(
      renderSceneContent(
        { type: 'interactive', html: '<p>تفاعلي</p>' },
        { staticWidgetNotice: 'يُعرض المحتوى التفاعلي في صورة ثابتة.' },
      ),
    ).toContain('يُعرض المحتوى التفاعلي في صورة ثابتة.');
  });

  it('renders a published widget as a static notice without serializing its runtime payload', () => {
    const html = renderSceneContent({
      type: 'plugin',
      pluginType: 'published-widget',
      data: {
        templateId: '00000000-0000-4000-8000-000000000059',
        versionId: '00000000-0000-4000-8000-000000000060',
        composition: {
          title: '<script>window.hostile = true</script>',
          nodes: [{ type: 'text', text: 'DO_NOT_EXPORT_RUNTIME' }],
        },
      },
    });

    expect(html).toContain('data-static-widget="true"');
    expect(html).toContain('capture statique');
    expect(html).not.toContain('window.hostile');
    expect(html).not.toContain('DO_NOT_EXPORT_RUNTIME');
    expect(html).not.toContain('00000000-0000-4000-8000-000000000060');
  });

  it('does not treat an ordinary plug-in as a published widget', () => {
    expect(
      renderSceneContent({ type: 'plugin', pluginType: 'cash-flow-simulator', data: {} }),
    ).toBe('');
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
    expect(html).toContain('<p>Titre</p>');
    expect(html).not.toContain('https://example.com/a.png');
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
