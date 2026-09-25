import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SEED_SYSTEM_PROMPT,
  ANCHOR_SEED_TEMPERATURE,
  buildSeedStockPrompt,
  parseSeedStock,
} from '@/lib/anchoring/seed-stock';

const labels = [
  'alpha',
  'beta',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliett',
  'kilo',
  'lima',
];
const editorialMoves = ['challenge', 'counterfactual', 'evidence', 'decision'] as const;

const valid = [
  ...Array.from({ length: 4 }, (_, index) => ({ kind: 'anecdote', index })),
  ...Array.from({ length: 4 }, (_, index) => ({ kind: 'highlight', index })),
  ...Array.from({ length: 2 }, (_, index) => ({ kind: 'joke', index })),
  ...Array.from({ length: 2 }, (_, index) => ({ kind: 'quiz_reminder', index })),
].map(({ kind, index }, globalIndex) => ({
  persona: index % 2 ? 'Analyste' : 'Penseur',
  kind,
  content: {
    move:
      kind === 'joke'
        ? ('wit' as const)
        : kind === 'quiz_reminder'
          ? ('retrieval' as const)
          : editorialMoves[index],
    push_hook: `Accroche ${labels[globalIndex]}`,
    body: `Angle ${labels[globalIndex]} ancré.`,
    scene_ref: 'scene-1',
    provenance: { event_id: '1', source_kind: 'learner_proposition' },
  },
}));

const recordedEvents = [
  {
    id: '1',
    actor: 'user' as const,
    event_type: 'learner_response',
    payload: { sceneId: 'scene-1', utterance: 'Le délai observé était de 30 jours.' },
    ts_ms: 30,
  },
];

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
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain(
      'Une récurrence sans cadence explicite ne devient jamais quotidienne',
    );
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain(
      'Chaque groupe nominal qui affirme un fait doit être présent dans le payload',
    );
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain('du nerf, du contraste et du rythme');
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain("Une paraphrase n'est pas une variation");
    expect(ANCHOR_SEED_SYSTEM_PROMPT).toContain(
      "N'affirme aucune conséquence, causalité, priorité relative",
    );
    expect(ANCHOR_SEED_TEMPERATURE).toBe(0.8);
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
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });

  it('refuse un stock au démarrage répétitif et sans rythme', () => {
    const flat = valid.map((seed) => ({
      ...seed,
      content: { ...seed.content, body: 'Tu as rappelé le délai observé.' },
    }));

    expect(() =>
      parseSeedStock(JSON.stringify(flat), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Seed stock repeats the same opening too often');
  });

  it('refuse la répétition du même mouvement cognitif sur un événement', () => {
    const repeatedMove = valid.map((seed, index) =>
      index === 1 ? { ...seed, content: { ...seed.content, move: 'challenge' as const } } : seed,
    );

    expect(() =>
      parseSeedStock(JSON.stringify(repeatedMove), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Repeated cognitive move for the same event and seed kind');
  });

  it('rejects an incomplete stock and any invented persona or scene', () => {
    expect(() =>
      parseSeedStock(JSON.stringify(valid.slice(0, 11)), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow();
    expect(() =>
      parseSeedStock(JSON.stringify([{ ...valid[0], persona: 'Inconnue' }, ...valid.slice(1)]), {
        learningApproach: 'andragogy',
        events: recordedEvents,
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
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Evaluative or comparative language is forbidden in andragogy');
    expect(
      parseSeedStock(JSON.stringify(evaluative), {
        learningApproach: 'pedagogy',
        events: recordedEvents,
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
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Numeric claim absent from session: 45');
  });

  it('refuse une provenance absente ou requalifiée par le modèle', () => {
    const unknownEvent = valid.map((seed, index) =>
      index === 0
        ? {
            ...seed,
            content: {
              ...seed.content,
              provenance: { event_id: '999', source_kind: 'learner_proposition' },
            },
          }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(unknownEvent), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Unknown session event: 999');

    const mismatchedKind = valid.map((seed, index) =>
      index === 0
        ? {
            ...seed,
            content: {
              ...seed.content,
              provenance: { event_id: '1', source_kind: 'agent_proposition' },
            },
          }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(mismatchedKind), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Seed provenance category does not match the recorded event');
  });

  it('réserve les plaisanteries à la persona joker disponible', () => {
    const wrongJoker = valid.map((seed) =>
      seed.kind === 'joke' ? { ...seed, persona: 'Analyste' } : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(wrongJoker), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste', 'Salma'],
        sceneRefs: ['scene-1'],
        personaMechanisms: { Penseur: 'coach', Analyste: 'analyst', Salma: 'joker' },
      }),
    ).toThrow('Joke seed must use a joker persona when the casting provides one');
  });

  it('refuse un moment relatif absent de la session', () => {
    const inventedTiming = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Applique cette méthode ce soir.' } }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(inventedTiming), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Temporal claim absent from session: ce soir');
  });

  it('refuse une cadence absente de la session', () => {
    const inventedCadence = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Ce coût revient chaque mois.' } }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(inventedCadence), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Temporal claim absent from session: chaque mois');
  });

  it('refuse une cadence reformulée absente de l’événement source', () => {
    const inventedCadence = valid.map((seed, index) =>
      index === 0
        ? { ...seed, content: { ...seed.content, body: 'Ce délai revient à chaque budget.' } }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(inventedCadence), {
        learningApproach: 'andragogy',
        events: recordedEvents,
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Temporal claim absent from session: chaque budget');
  });

  it('refuse le contenu distinctif provenant d’un autre événement', () => {
    const contaminated = valid.map((seed, index) =>
      index === 0
        ? {
            ...seed,
            content: { ...seed.content, body: 'Reprends maintenant les coûts récurrents.' },
          }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(contaminated), {
        learningApproach: 'andragogy',
        events: [
          ...recordedEvents,
          {
            id: '2',
            actor: 'user',
            event_type: 'learner_response',
            payload: { utterance: 'Je sous-estime les coûts récurrents.' },
            ts_ms: 31,
          },
        ],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Seed content leaks another event: couts recurrents');
  });

  it('refuse deux concepts non adjacents provenant d’un autre événement', () => {
    const contaminated = valid.map((seed, index) =>
      index === 0
        ? {
            ...seed,
            content: {
              ...seed.content,
              body: 'Une hypothèse mérite-t-elle une borne basse et une borne haute ?',
            },
          }
        : seed,
    );
    expect(() =>
      parseSeedStock(JSON.stringify(contaminated), {
        learningApproach: 'andragogy',
        events: [
          ...recordedEvents,
          {
            id: '2',
            actor: 'user',
            event_type: 'learner_response',
            payload: { utterance: 'Je compare une hypothèse basse avec une hypothèse haute.' },
            ts_ms: 31,
          },
        ],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toThrow('Seed content leaks another event');
  });

  it('accepte une expression d’action qui partage le sujet de l’événement source', () => {
    const nextBudgetAction = valid.map((seed, index) =>
      index === 0
        ? {
            ...seed,
            content: { ...seed.content, body: 'Reprends ce délai dans ton prochain budget.' },
          }
        : seed,
    );
    expect(
      parseSeedStock(JSON.stringify(nextBudgetAction), {
        learningApproach: 'andragogy',
        events: [
          {
            ...recordedEvents[0],
            payload: { utterance: 'Le délai de ce budget était de 30 jours.' },
          },
          {
            id: '2',
            actor: 'user',
            event_type: 'learner_response',
            payload: { utterance: 'Pour mon prochain budget, je testerai les hypothèses.' },
            ts_ms: 31,
          },
        ],
        personas: ['Penseur', 'Analyste'],
        sceneRefs: ['scene-1'],
      }),
    ).toHaveLength(12);
  });
});
