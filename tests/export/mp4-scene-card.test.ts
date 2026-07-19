import { describe, expect, it } from 'vitest';
import { buildSceneCardSvg, sceneReadableText } from '@/lib/export/mp4/scene-card';

describe('MP4 scene cards', () => {
  it('extracts pedagogical text without leaking media URLs or HTML', () => {
    const text = sceneReadableText({
      canvas: { elements: [{ content: 'Routage LiteLLM' }, { src: 'https://secret.example/image' }] },
      html: '<script>ignored()</script>',
      question: 'Pourquoi prévoir un fallback ?',
    });
    expect(text).toContain('Routage LiteLLM');
    expect(text).toContain('Pourquoi prévoir un fallback ?');
    expect(text).not.toContain('secret.example');
    expect(text).not.toContain('ignored');
  });

  it('renders a valid 16:9 SVG card with escaped content and progress', () => {
    const svg = buildSceneCardSvg({
      classroomName: 'LiteLLM & production',
      sceneTitle: 'Coûts < garde-fous',
      sceneType: 'slide',
      sceneNumber: 2,
      sceneCount: 10,
      content: { text: 'Comparer les modèles' },
    });
    expect(svg).toContain('width="1920" height="1080"');
    expect(svg).toContain('LiteLLM &amp; production');
    expect(svg).toContain('Coûts &lt; garde-fous');
    expect(svg).toContain('2 / 10');
  });
});
