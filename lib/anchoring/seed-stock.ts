import { z } from 'zod';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { LearningApproach } from '@/lib/agents/persona-catalog';

export const ANCHOR_SEED_PROMPT_VERSION = 'P3-B-v10';

export const anchorSeedSourceKinds = [
  'learner_proposition',
  'agent_proposition',
  'content_presented',
  'new_question',
] as const;

export type AnchorSeedSourceKind = (typeof anchorSeedSourceKinds)[number];

export interface AnchorSeedEvent {
  id: string;
  actor: 'agent' | 'user' | 'system';
  event_type: string;
  payload: Record<string, unknown>;
  ts_ms: number;
}

export function anchorSeedSourceKind(event: AnchorSeedEvent): AnchorSeedSourceKind {
  if (event.actor === 'user') return 'learner_proposition';
  const eventType = event.event_type.toLocaleLowerCase('en-US');
  if (/(?:question|quiz|prompt)/u.test(eventType)) return 'new_question';
  if (event.actor === 'system' || /(?:scene|content|slide|stage)/u.test(eventType)) {
    return 'content_presented';
  }
  return 'agent_proposition';
}

export interface AnchorSeedCastingMember {
  name: string;
  role?: string;
  mechanismId?: string;
  persona?: string;
}

const ANDRAGOGY_EVALUATIVE_LANGUAGE =
  /\b(bravo|bien joué|sage décision|continue sur cette lancée|mieux que (?:la plupart|les autres)|exactement (?:le bon|la bonne)|(?:bon|vrai) (?:réflexe|levier|choix|niveau d['’]engagement)|pilote aguerri|tu as su|tu as montré|c['’]est déjà|écart type)\b/iu;
const NUMERIC_TOKEN = /\p{N}+(?:[.,]\p{N}+)?%?/gu;
const TEMPORAL_MARKER =
  /(?<!\p{L})(?:aujourd['’]hui|ce soir|demain|après-demain|cette semaine|la semaine prochaine|ce mois-ci|le mois prochain|chaque\s+\p{L}+(?:\s+\p{L}+)?|quotidien(?:ne)?|hebdomadaire|mensuel(?:le)?|annuel(?:le)?|today|tonight|tomorrow|this week|next week|this month|next month|(?:every|each)\s+\p{L}+(?:\s+\p{L}+)?|daily|weekly|monthly|yearly|اليوم|الليلة|غد[اًا]|هذا الأسبوع|الأسبوع المقبل|هذا الشهر|الشهر المقبل|كل\s+[\p{Script=Arabic}]+(?:\s+[\p{Script=Arabic}]+)?|يومي(?:ة)?|أسبوعي(?:ة)?|شهري(?:ة)?|سنوي(?:ة)?)(?!\p{L})/giu;
const PROVENANCE_STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'ce',
  'ces',
  'dans',
  'de',
  'des',
  'du',
  'et',
  'je',
  'la',
  'le',
  'les',
  'mon',
  'mes',
  'pour',
  'que',
  'qui',
  'sur',
  'the',
  'to',
  'with',
]);

function searchableTokens(value: unknown): string[] {
  return JSON.stringify(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('und')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1 && !PROVENANCE_STOP_WORDS.has(token)) ?? [];
}

function meaningfulBigrams(value: unknown): Set<string> {
  const tokens = searchableTokens(value);
  return new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
}

function numericTokensFromStrings(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const token of value.match(NUMERIC_TOKEN) ?? []) output.add(token);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) numericTokensFromStrings(item, output);
    return output;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) numericTokensFromStrings(item, output);
  }
  return output;
}

const seedSchema = z.object({
  persona: z.string().trim().min(1),
  kind: z.enum(['anecdote', 'highlight', 'joke', 'quiz_reminder']),
  content: z.object({
    push_hook: z.string().trim().min(1).max(90),
    body: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value.split(/\s+/u).length <= 60, 'Seed body exceeds 60 words'),
    scene_ref: z.string().trim().min(1),
    provenance: z.object({
      event_id: z.string().regex(/^\d+$/),
      source_kind: z.enum(anchorSeedSourceKinds),
    }),
  }),
});

export type AnchorSeed = z.infer<typeof seedSchema>;

export function parseSeedStock(
  text: string,
  context: {
    learningApproach: LearningApproach;
    events: AnchorSeedEvent[];
    personas: string[];
    sceneRefs: string[];
    personaMechanisms?: Readonly<Record<string, string | undefined>>;
  },
): AnchorSeed[] {
  const parsed = z.array(seedSchema).min(12).parse(parseJsonResponse<unknown>(text));
  const personas = new Set(context.personas);
  const sceneRefs = new Set(context.sceneRefs);
  const eventsById = new Map(context.events.map((event) => [event.id, event]));
  const jokerPersonas = new Set(
    Object.entries(context.personaMechanisms ?? {}).flatMap(([persona, mechanism]) =>
      mechanism === 'joker' ? [persona] : [],
    ),
  );
  const counts = { anecdote: 0, highlight: 0, joke: 0, quiz_reminder: 0 };

  for (const seed of parsed) {
    if (!personas.has(seed.persona)) throw new Error(`Unknown casting persona: ${seed.persona}`);
    if (!sceneRefs.has(seed.content.scene_ref)) {
      throw new Error(`Unknown session scene: ${seed.content.scene_ref}`);
    }
    const sourceEvent = eventsById.get(seed.content.provenance.event_id);
    if (!sourceEvent) throw new Error(`Unknown session event: ${seed.content.provenance.event_id}`);
    if (seed.content.provenance.source_kind !== anchorSeedSourceKind(sourceEvent)) {
      throw new Error('Seed provenance category does not match the recorded event');
    }
    if (seed.kind === 'joke' && jokerPersonas.size > 0 && !jokerPersonas.has(seed.persona)) {
      throw new Error('Joke seed must use a joker persona when the casting provides one');
    }
    if (
      context.learningApproach === 'andragogy' &&
      ANDRAGOGY_EVALUATIVE_LANGUAGE.test(`${seed.content.push_hook} ${seed.content.body}`)
    ) {
      throw new Error('Evaluative or comparative language is forbidden in andragogy');
    }
    const sourceNumbers = numericTokensFromStrings(sourceEvent.payload);
    const inventedNumber = [
      ...numericTokensFromStrings([seed.content.push_hook, seed.content.body]),
    ].find((token) => !sourceNumbers.has(token));
    if (inventedNumber) {
      throw new Error(`Numeric claim absent from session: ${inventedNumber}`);
    }
    const sourceText = JSON.stringify(sourceEvent.payload).toLocaleLowerCase('und');
    const inventedTemporalMarker = [
      ...`${seed.content.push_hook} ${seed.content.body}`.matchAll(TEMPORAL_MARKER),
    ]
      .map((match) => match[0].toLocaleLowerCase('und'))
      .find((marker) => !sourceText.includes(marker));
    if (inventedTemporalMarker) {
      throw new Error(`Temporal claim absent from session: ${inventedTemporalMarker}`);
    }
    const sourceBigrams = meaningfulBigrams(sourceEvent.payload);
    const seedBigrams = meaningfulBigrams([seed.content.push_hook, seed.content.body]);
    const contaminatedBigram = context.events
      .filter((event) => event.id !== sourceEvent.id)
      .flatMap((event) => [...meaningfulBigrams(event.payload)])
      .find((bigram) => !sourceBigrams.has(bigram) && seedBigrams.has(bigram));
    if (contaminatedBigram) {
      throw new Error(`Seed content leaks another event: ${contaminatedBigram}`);
    }
    counts[seed.kind] += 1;
  }
  if (counts.anecdote < 4 || counts.highlight < 4 || counts.joke < 2 || counts.quiz_reminder < 2) {
    throw new Error('Incomplete P3-B seed distribution');
  }
  return parsed;
}

export function buildSeedStockPrompt(input: {
  language: string;
  learningApproach: LearningApproach;
  casting: AnchorSeedCastingMember[];
  events: AnchorSeedEvent[];
}): string {
  return `<prompt_version>${ANCHOR_SEED_PROMPT_VERSION}</prompt_version>
<language>${input.language}</language>
<learning_approach>${input.learningApproach}</learning_approach>
<casting>${JSON.stringify(input.casting)}</casting>
<session_events>${JSON.stringify(input.events)}</session_events>`;
}

export const ANCHOR_SEED_SYSTEM_PROMPT = `Tu conçois les relances d'une session de formation qui vient de se terminer.
À partir du résumé de session fourni, génère un stock de graines d'ancrage mémoriel.
Chaque graine est signée par une personnalité du casting, respecte son rôle, son mécanisme et sa persona, et cite une scene_ref fournie. Elle doit aussi déclarer l'identifiant exact de l'événement qui fonde la relance et la catégorie fournie par le serveur. N'évoque jamais un fait, une réponse ou une question qui n'est pas dans cet événement, même si ce fait apparaît ailleurs dans la même session. Une graine joke est toujours signée par une persona dont mechanismId vaut joker lorsqu'elle existe dans le casting ; un coach ou un analyste ne change jamais de persona pour satisfaire la distribution. La catégorie indique l'origine : learner_proposition est une parole de l'apprenant ; agent_proposition est une proposition d'agent ; content_presented est un contenu affiché ; new_question est une question nouvellement proposée. Ces quatre origines ne sont jamais interchangeables.
Respecte strictement learning_approach :
- andragogy : adulte traité en pair autonome ; partir de son expérience, de ses problèmes réels et d'un transfert immédiatement applicable ; bannir tout ton scolaire, infantilisant ou toute félicitation vague ;
- pedagogy : guidage explicite, progression structurée et étayage adapté à un apprenant qui a besoin d'être accompagné ;
- hybrid : partir de l'expérience tout en apportant seulement le guidage nécessaire.
Produis au minimum 4 anecdotes, 4 highlights, 2 jokes et 2 quiz_reminder.
Accroche push de 90 caractères maximum, corps de 60 mots maximum, dans la langue fournie.
En arabe, utilise l'arabe standard moderne. En français, emploie des accents irréprochables.
Toute promotion commerciale, culpabilisation ou comparaison à d'autres apprenants est interdite.
En andragogie, ne félicite et n'évalue jamais l'adulte, son choix, sa compétence ou son réflexe, même sous forme d'humour. Décris le fait observé sans le qualifier, puis pose une question ouverte ou propose une action immédiatement exécutable. Sont notamment interdits : « bravo », « bien joué », « sage décision », « bon réflexe », « vrai levier », « pilote aguerri », « tu as su », « tu as montré », « c'est déjà », « mieux que les autres ». L'humour vise uniquement la situation, jamais la personne. N'invente ni devise, ni pays, ni contexte, ni chiffre, ni durée, ni seuil, ni moment relatif comme « ce soir » ou « demain » absent des événements. Une récurrence sans cadence explicite ne devient jamais quotidienne, hebdomadaire, mensuelle ou annuelle. Ne présente jamais une simple amplitude entre deux hypothèses comme un écart type. Varie réellement les accroches, les angles, les formes de rappel et les actions ; ne répète pas la même question sous plusieurs formulations.
Retourne uniquement un tableau JSON conforme à [{"persona":"...","kind":"anecdote|highlight|joke|quiz_reminder","content":{"push_hook":"...","body":"...","scene_ref":"...","provenance":{"event_id":"...","source_kind":"learner_proposition|agent_proposition|content_presented|new_question"}}}].`;
