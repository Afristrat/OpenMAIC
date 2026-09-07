import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SEED_SYSTEM_PROMPT,
  buildSeedStockPrompt,
  parseSeedStock,
} from '@/lib/anchoring/seed-stock';

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
  it('transmet l’approche et distingue explicitement l’andragogie', () => {
    expect(
      buildSeedStockPrompt({
        language: 'fr-FR',
        learningApproach: 'andragogy',
        personas: ['Hanae'],
        events: [],
      }),
    ).toContain('<learning_approach>andragogy</learning_approach>');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('adulte traité en pair autonome');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('pedagogy : guidage explicite');
  });

  it('accepts the complete P3-B distribution bound to the actual session', () => {
    expect(
      parseSeedStock(JSON.stringify(valid), {
        learningApproach: 'andragogy',
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });

  it('rejects an incomplete stock and any invented persona or scene', () => {
    expect(() =>
      parseSeedStock(JSON.stringify(valid.slice(0, 11)), {
        learningApproach: 'andragogy',
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow();
    expect(() =>
      parseSeedStock(JSON.stringify([{ ...valid[0], persona: 'Inconnue' }, ...valid.slice(1)]), {
        learningApproach: 'andragogy',
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
        {
          learningApproach: 'andragogy',
          personas: ['Penseur', 'Analyste'],
          sceneRefs: ['scene-1'],
        },
      ),
    ).toThrow();
  });

  it('refuse les félicitations et comparaisons en andragogie uniquement', () => {
    const evaluative = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Bien joué, mieux que la plupart.' } }
        : seed,
    );

    expect(() =>
      parseSeedStock(JSON.stringify(evaluative), {
        learningApproach: 'andragogy',
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Evaluative or comparative language is forbidden in andragogy');
    expect(
      parseSeedStock(JSON.stringify(evaluative), {
        learningApproach: 'pedagogy',
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });
});
