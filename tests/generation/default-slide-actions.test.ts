import { describe, expect, it } from 'vitest';
import { generateDefaultSlideActions } from '@/lib/generation/scene-generator';
import type { SceneOutline } from '@/lib/types/generation';

const outline: SceneOutline = {
  id: 'scene',
  type: 'slide',
  title: 'Trésorerie',
  description: 'Comprendre la trésorerie.',
  keyPoints: ['Construire les hypothèses', 'Contrôler les encaissements'],
  order: 1,
};

describe('localized fallback narration', () => {
  it('never inserts Chinese punctuation into French narration', () => {
    const speech = generateDefaultSlideActions(outline, [], 'Teach in French.').find(
      (action) => action.type === 'speech',
    );
    expect(speech).toMatchObject({
      title: 'Explication',
      text: 'Construire les hypothèses. Contrôler les encaissements.',
    });
    expect(JSON.stringify(speech)).not.toContain('。');
  });
});
