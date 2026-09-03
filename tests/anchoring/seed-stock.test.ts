import { describe, expect, it } from 'vitest';
import { parseSeedStock } from '@/lib/anchoring/seed-stock';

const valid = [
  ...Array.from({ length: 4 }, (_, index) => ({ kind: 'anecdote', index })),
  ...Array.from({ length: 4 }, (_, index) => ({ kind: 'highlight', index })),
  ...Array.from({ length: 2 }, (_, index) => ({ kind: 'joke', index })),
  ...Array.from({ length: 2 }, (_, index) => ({ kind: 'quiz_reminder', index })),
].map(({ kind, index }) => ({
  persona: index % 2 ? 'Analyste' : 'Penseur',
  kind,
  content: { push_hook: `Accroche ${kind} ${index}`, body: 'Corps ancré.', scene_ref: 'scene-1' },
}));

describe('anchoring seed stock', () => {
  it('accepts the complete P3-B distribution bound to the actual session', () => {
    expect(
      parseSeedStock(JSON.stringify(valid), {
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });

  it('rejects an incomplete stock and any invented persona or scene', () => {
    expect(() =>
      parseSeedStock(JSON.stringify(valid.slice(0, 11)), {
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow();
    expect(() =>
      parseSeedStock(JSON.stringify([{ ...valid[0], persona: 'Inconnue' }, ...valid.slice(1)]), {
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow();
    expect(() =>
      parseSeedStock(
        JSON.stringify([
          { ...valid[0], content: { ...valid[0].content, scene_ref: 'inventée' } },
          ...valid.slice(1),
        ]),
        { personas: ['Penseur', 'Analyste'], sceneRefs: ['scene-1'] },
      ),
    ).toThrow();
  });
});
