import assert from 'node:assert/strict';
import { callLLM } from '@/lib/ai/llm';
import { getModel } from '@/lib/ai/providers';
import {
  ANCHOR_SEED_PROMPT_VERSION,
  ANCHOR_SEED_SYSTEM_PROMPT,
  buildSeedStockPrompt,
  parseSeedStock,
  type AnchorSeedEvent,
} from '@/lib/anchoring/seed-stock';

if (process.env.QALEM_PRODUCTION_RECIPE_CONFIRM !== 'S3-008-SEED-SAMPLE') {
  throw new Error('Confirmation S3-008 absente');
}

const apiKey = process.env.OPENAI_API_KEY?.trim();
const baseUrl = process.env.OPENAI_BASE_URL?.trim();
assert(apiKey, 'OPENAI_API_KEY absente');
assert(baseUrl, 'OPENAI_BASE_URL absente');

const events: AnchorSeedEvent[] = [
  {
    id: '1',
    actor: 'user',
    event_type: 'learner_response',
    payload: {
      sceneId: 'scene-budget',
      utterance:
        'Dans mes projets, je sous-estime souvent les coûts récurrents lorsque je prépare le budget.',
    },
    ts_ms: 1_000,
  },
  {
    id: '2',
    actor: 'user',
    event_type: 'learner_response',
    payload: {
      sceneId: 'scene-risques',
      utterance:
        'Dans le scénario tendu, j’ai classé le risque de trésorerie avant les autres risques.',
    },
    ts_ms: 2_000,
  },
  {
    id: '3',
    actor: 'user',
    event_type: 'learner_response',
    payload: {
      sceneId: 'scene-actions',
      utterance:
        'Pour mon prochain budget, je testerai chaque poste avec une hypothèse basse et une hypothèse haute.',
    },
    ts_ms: 3_000,
  },
];

const casting = [
  {
    name: 'Hanae',
    role: 'assistant',
    mechanismId: 'coach',
    persona:
      'Encourage avec exigence. Elle demande un prochain pas concret, donne un retour précis sur ce qui est formulé et évite l’enthousiasme creux ou infantilisant.',
  },
  {
    name: 'Youssef',
    role: 'assistant',
    mechanismId: 'analyst',
    persona:
      'Met les affirmations à l’épreuve des faits. Il compare, quantifie, recherche les causes, distingue corrélation et causalité et aide l’apprenant à décider sur des critères explicites.',
  },
  {
    name: 'Salma',
    role: 'student',
    mechanismId: 'joker',
    persona:
      'Énergise le groupe par une remarque brève, une analogie mémorable ou un décalage humoristique pertinent. Son humour ne vise jamais une personne et se retire dans les moments sensibles.',
  },
];

const modelId = process.env.S3_008_MODEL?.trim() || 'general';
const { model } = getModel({
  providerId: 'openai',
  providerType: 'openai',
  apiKey,
  baseUrl,
  modelId,
});

const prompt = `${buildSeedStockPrompt({
  language: 'fr-FR',
  learningApproach: 'andragogy',
  casting,
  events,
})}
<requested_seed_count>20</requested_seed_count>
Pour ce checkpoint humain uniquement, produis exactement vingt graines : six anecdotes, six highlights, quatre jokes et quatre quiz_reminder. Diversifie les accroches, les angles et les formes de rappel ; ne reformule pas plusieurs fois la même question.`;

const result = await callLLM(
  {
    model,
    system: ANCHOR_SEED_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 8_192,
  },
  's3-008-current-seed-sample',
  undefined,
  { mode: 'disabled', enabled: false },
);

const seeds = parseSeedStock(result.text, {
  learningApproach: 'andragogy',
  events,
  personas: casting.map((member) => member.name),
  sceneRefs: ['scene-budget', 'scene-risques', 'scene-actions'],
});
assert.equal(seeds.length, 20, 'Le modèle n’a pas produit exactement vingt graines');

const distribution = Object.fromEntries(
  ['anecdote', 'highlight', 'joke', 'quiz_reminder'].map((kind) => [
    kind,
    seeds.filter((seed) => seed.kind === kind).length,
  ]),
);
assert.deepEqual(distribution, {
  anecdote: 6,
  highlight: 6,
  joke: 4,
  quiz_reminder: 4,
});
assert.equal(new Set(seeds.map((seed) => seed.content.push_hook)).size, 20);

process.stdout.write(
  JSON.stringify(
    {
      schemaVersion: 2,
      storyId: 'S3-008',
      generatedAt: new Date().toISOString(),
      promptVersion: ANCHOR_SEED_PROMPT_VERSION,
      learningApproach: 'andragogy',
      model: modelId,
      usage: result.totalUsage,
      count: seeds.length,
      distribution,
      proposedFrequency: {
        scheduledSeedCount: 12,
        coldEvaluationCount: 2,
        totalDeliveryCount: 14,
        seedDays: [2, 5, 9, 14, 20, 27, 35, 44, 54, 65, 77, 90],
        coldEvaluationDays: [30, 60],
        horizonDays: 90,
      },
      humanAcceptance: false,
      events,
      casting,
      seeds,
    },
    null,
    2,
  ),
);
