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
  content: { push_hook: `Accroche ${kind}`, body: 'Corps ancré.', scene_ref: 'scene-1' },
}));

describe('anchoring seed stock', () => {
  it('transmet l’approche et distingue explicitement l’andragogie', () => {
    expect(
      buildSeedStockPrompt({
        language: 'fr-FR',
        learningApproach: 'andragogy',
        casting: [
          {
            name: 'Hanae',
            role: 'assistant',
            mechanismId: 'coach',
            persona: 'Demande un prochain pas concret.',
          },
        ],
        events: [],
      }),
    ).toContain('<learning_approach>andragogy</learning_approach>');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('adulte traité en pair autonome');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('pedagogy : guidage explicite');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('respecte son rôle, son mécanisme et sa persona');
    expect(
      buildSeedStockPrompt({
        language: 'fr-FR',
        learningApproach: 'andragogy',
        casting: [
          {
            name: 'Hanae',
            role: 'assistant',
            mechanismId: 'coach',
            persona: 'Demande un prochain pas concret.',
          },
        ],
        events: [],
      }),
    ).toContain('"mechanismId":"coach"');
  });

  it('accepts the complete P3-B distribution bound to the actual session', () => {
    expect(
      parseSeedStock(JSON.stringify(valid), {
        learningApproach: 'andragogy',
        events: [],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });

  it('rejects an incomplete stock and any invented persona or scene', () => {
    expect(() =>
      parseSeedStock(JSON.stringify(valid.slice(0, 11)), {
        learningApproach: 'andragogy',
        events: [],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow();
    expect(() =>
      parseSeedStock(JSON.stringify([{ ...valid[0], persona: 'Inconnue' }, ...valid.slice(1)]), {
        learningApproach: 'andragogy',
        events: [],
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
          events: [],
          personas: ['Penseur', 'Analyste'],
          sceneRefs: ['scene-1'],
        },
      ),
    ).toThrow();
  });

  it('refuse les félicitations et comparaisons en andragogie uniquement', () => {
    const evaluative = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Ce choix est un bon réflexe.' } }
        : seed,
    );

    expect(() =>
      parseSeedStock(JSON.stringify(evaluative), {
        learningApproach: 'andragogy',
        events: [],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Evaluative or comparative language is forbidden in andragogy');
    expect(
      parseSeedStock(JSON.stringify(evaluative), {
        learningApproach: 'pedagogy',
        events: [],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });

  it('refuse un nombre absent des paroles de la session', () => {
    const invented = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Simule un retard de 45 jours.' } }
        : seed,
    );

    expect(() =>
      parseSeedStock(JSON.stringify(invented), {
        learningApproach: 'andragogy',
        events: [{ payload: { utterance: 'Le délai observé était de 30 jours.' }, ts_ms: 45 }],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Numeric claim absent from session: 45');
  });
});
