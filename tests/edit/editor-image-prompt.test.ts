import { describe, expect, it } from 'vitest';
import { buildEditorImagePrompt, sceneTranscript } from '@/lib/edit/editor-image-prompt';

describe('editor image prompt', () => {
  it('grounds the image brief in every speech line without agent metadata', () => {
    const actions = [
      { id: 'a1', type: 'speech' as const, agentId: 'teacher', text: 'Le SIPOC comporte cinq colonnes.' },
      { id: 'a2', type: 'spotlight' as const, elementId: 'shape-1' },
      { id: 'a3', type: 'speech' as const, agentId: 'curious', text: 'Reliez les fournisseurs aux entrées.' },
    ];
    expect(sceneTranscript(actions)).toBe(
      'Le SIPOC comporte cinq colonnes.\nReliez les fournisseurs aux entrées.',
    );
    const prompt = buildEditorImagePrompt({ sceneTitle: 'Cartographie SIPOC', actions });
    expect(prompt).toContain('Le SIPOC comporte cinq colonnes.');
    expect(prompt).toContain('représente réellement sa structure');
    expect(prompt).not.toContain('agentId');
  });
});
