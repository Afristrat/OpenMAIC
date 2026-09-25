import { z } from 'zod';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { LearningApproach } from '@/lib/agents/persona-catalog';

export const ANCHOR_SEED_PROMPT_VERSION = 'P3-B-v13';
export const ANCHOR_SEED_TEMPERATURE = 0.8;

export const anchorSeedMoves = [
  'challenge',
  'counterfactual',
  'evidence',
  'decision',
  'transfer',
  'reframe',
  'retrieval',
  'wit',
] as const;

export type AnchorSeedMove = (typeof anchorSeedMoves)[number];

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
  return (
    JSON.stringify(value)
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase('und')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !PROVENANCE_STOP_WORDS.has(token)) ?? []
  );
}

function meaningfulBigrams(value: unknown): Set<string> {
  const tokens = searchableTokens(value);
  return new Set(tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`));
}

function distinctiveEventTokens(value: unknown, sourceTokens: ReadonlySet<string>): Set<string> {
  return new Set(searchableTokens(value).filter((token) => !sourceTokens.has(token)));
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
    move: z.enum(anchorSeedMoves),
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
  const hookSignatures = new Set<string>();
  const openingCounts = new Map<string, number>();
  const editorialMoves = new Set<AnchorSeedMove>();
  const eventKindMoves = new Set<string>();

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
    if (seed.kind === 'joke' && seed.content.move !== 'wit') {
      throw new Error('Joke seed must use the wit cognitive move');
    }
    if (seed.kind === 'quiz_reminder' && seed.content.move !== 'retrieval') {
      throw new Error('Quiz reminder must use the retrieval cognitive move');
    }
    if (
      (seed.kind === 'anecdote' || seed.kind === 'highlight') &&
      (seed.content.move === 'wit' || seed.content.move === 'retrieval')
    ) {
      throw new Error('Editorial seed must use an active cognitive move');
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
    const sourceTokens = new Set(searchableTokens(sourceEvent.payload));
    const seedBigrams = meaningfulBigrams([seed.content.push_hook, seed.content.body]);
    const contaminatedBigram = context.events
      .filter((event) => event.id !== sourceEvent.id)
      .flatMap((event) => [...meaningfulBigrams(event.payload)])
      .find(
        (bigram) =>
          !sourceBigrams.has(bigram) &&
          bigram.split(' ').every((token) => !sourceTokens.has(token)) &&
          seedBigrams.has(bigram),
      );
    if (contaminatedBigram) {
      throw new Error(`Seed content leaks another event: ${contaminatedBigram}`);
    }
    const seedTokens = new Set(searchableTokens([seed.content.push_hook, seed.content.body]));
    const contaminatedEvent = context.events
      .filter((event) => event.id !== sourceEvent.id)
      .map((event) => ({
        overlap: [...distinctiveEventTokens(event.payload, sourceTokens)].filter((token) =>
          seedTokens.has(token),
        ),
      }))
      .find(({ overlap }) => overlap.length >= 2);
    if (contaminatedEvent) {
      throw new Error(
        `Seed content leaks another event: ${contaminatedEvent.overlap.slice(0, 2).join(' ')}`,
      );
    }
    const hookSignature = searchableTokens(seed.content.push_hook).join(' ');
    if (hookSignatures.has(hookSignature)) throw new Error('Duplicate seed hook');
    hookSignatures.add(hookSignature);

    const openingSignature = searchableTokens(seed.content.body).slice(0, 2).join(' ');
    if (openingSignature) {
      openingCounts.set(openingSignature, (openingCounts.get(openingSignature) ?? 0) + 1);
    }

    if (seed.kind === 'anecdote' || seed.kind === 'highlight') {
      editorialMoves.add(seed.content.move);
      const moveKey = `${seed.content.provenance.event_id}:${seed.kind}:${seed.content.move}`;
      if (eventKindMoves.has(moveKey)) {
        throw new Error('Repeated cognitive move for the same event and seed kind');
      }
      eventKindMoves.add(moveKey);
    }
    counts[seed.kind] += 1;
  }
  if (counts.anecdote < 4 || counts.highlight < 4 || counts.joke < 2 || counts.quiz_reminder < 2) {
    throw new Error('Incomplete P3-B seed distribution');
  }
  const maxSharedOpening = Math.max(2, Math.ceil(parsed.length * 0.2));
  if ([...openingCounts.values()].some((count) => count > maxSharedOpening)) {
    throw new Error('Seed stock repeats the same opening too often');
  }
  if (editorialMoves.size < 4) {
    throw new Error('Seed stock lacks cognitive variety');
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

export const ANCHOR_SEED_SYSTEM_PROMPT = `Tu es directeur éditorial de relances post-formation. Tu écris avec du nerf, du contraste et du rythme, sans sacrifier la fidélité factuelle.
À partir du résumé de session fourni, génère un stock de graines d'ancrage mémoriel.
Chaque graine est signée par une personnalité du casting, respecte son rôle, son mécanisme et sa persona, et cite une scene_ref fournie. Elle doit aussi déclarer l'identifiant exact de l'événement qui fonde la relance et la catégorie fournie par le serveur. N'évoque jamais un fait, une réponse ou une question qui n'est pas dans cet événement, même si ce fait apparaît ailleurs dans la même session. Une graine joke est toujours signée par une persona dont mechanismId vaut joker lorsqu'elle existe dans le casting ; un coach ou un analyste ne change jamais de persona pour satisfaire la distribution. La catégorie indique l'origine : learner_proposition est une parole de l'apprenant ; agent_proposition est une proposition d'agent ; content_presented est un contenu affiché ; new_question est une question nouvellement proposée. Ces quatre origines ne sont jamais interchangeables.
Avant de rédiger chaque graine, isole son événement de provenance et ignore tous les autres. Chaque groupe nominal qui affirme un fait doit être présent dans le payload de cet événement. Les marqueurs de fréquence « chaque », « quotidien », « hebdomadaire », « mensuel », « annuel », « every », « each » et « كل » sont interdits sauf s'ils figurent explicitement dans ce même payload. Une proposition d'action peut être nouvelle, mais elle ne doit introduire aucun objet, cadence, quantité, contexte ou contrainte factuelle absent de cet événement. Formule toute action nouvelle comme un test à mener ou une question à trancher, jamais comme un résultat déjà établi. N'affirme aucune conséquence, causalité, priorité relative, solidité, fragilité, diagnostic ou attribut qui ne figure pas explicitement dans l'événement source. Ainsi, « Testez X et observez ce qui change » est recevable ; « X révèle la faiblesse, décide de la marge ou mérite moins d'attention » est refusé si l'événement ne le dit pas.
Respecte strictement learning_approach :
- andragogy : adulte traité en pair autonome ; partir de son expérience, de ses problèmes réels et d'un transfert immédiatement applicable ; bannir tout ton scolaire, infantilisant ou toute félicitation vague ;
- pedagogy : guidage explicite, progression structurée et étayage adapté à un apprenant qui a besoin d'être accompagné ;
- hybrid : partir de l'expérience tout en apportant seulement le guidage nécessaire.
Produis au minimum 4 anecdotes, 4 highlights, 2 jokes et 2 quiz_reminder.
Accroche push de 90 caractères maximum, corps de 60 mots maximum, dans la langue fournie.
En arabe, utilise l'arabe standard moderne. En français, emploie des accents irréprochables.
Toute promotion commerciale, culpabilisation ou comparaison à d'autres apprenants est interdite.
En andragogie, ne félicite et n'évalue jamais l'adulte, son choix, sa compétence ou son réflexe, même sous forme d'humour. Sont notamment interdits : « bravo », « bien joué », « sage décision », « bon réflexe », « vrai levier », « pilote aguerri », « tu as su », « tu as montré », « c'est déjà », « mieux que les autres ». L'humour vise uniquement la situation, jamais la personne. N'invente ni devise, ni pays, ni contexte, ni chiffre, ni durée, ni seuil, ni moment relatif comme « ce soir » ou « demain » absent des événements. Une récurrence sans cadence explicite ne devient jamais quotidienne, hebdomadaire, mensuelle ou annuelle. Ne présente jamais une simple amplitude entre deux hypothèses comme un écart type.

Contrat éditorial dynamique :
- attribue à chaque graine un move : challenge révèle une tension ; counterfactual inverse une hypothèse ; evidence réclame une preuve observable ; decision force un critère ou un arbitrage ; transfer projette vers une situation d'usage ; reframe change l'angle de lecture ; retrieval fait rappeler sans réenseigner ; wit crée un trait bref, adulte et professionnel ;
- une anecdote ou un highlight utilise challenge, counterfactual, evidence, decision, transfer ou reframe ; une joke utilise wit ; un quiz_reminder utilise retrieval ;
- pour un même événement et un même kind, ne réutilise jamais le même move ; emploie au moins quatre moves éditoriaux dans le stock ;
- donne une voix reconnaissable aux mécanismes : le coach met en mouvement sans materner ; l'analyste crée une friction intellectuelle par les faits, les critères ou le contre-exemple ; le joker produit une chute brève et incisive, jamais une comparaison enfantine ou décorative ;
- alterne phrase-coup de poing, question qui déplace le regard, micro-défi, choix inconfortable et rappel de terrain ; toutes les graines ne se terminent pas par une question ;
- attaque directement par l'enjeu, la tension, l'image ou l'action. Au maximum une graine sur cinq peut commencer par un récapitulatif comme « Tu as dit », « Tu as choisi » ou « Dans la session » ;
- deux graines ne partagent ni la même accroche, ni le même mouvement rhétorique appliqué au même événement. Une paraphrase n'est pas une variation.

Contraste de structure, sans contenu à recopier :
- FADE ET REFUSÉ : récapituler le fait, puis ajouter une question générique ;
- VIVANT ET RECEVABLE : ouvrir sur la tension exacte du fait, déplacer le regard par un contre-exemple ou un choix, puis provoquer une décision ou une observation concrète ;
- FADE ET REFUSÉ : expliquer à nouveau ce qui vient d'être appris ;
- VIVANT ET RECEVABLE : retirer l'échafaudage et confronter l'adulte à une situation où il doit mobiliser lui-même ce qu'il retient.

Retourne uniquement un tableau JSON conforme à [{"persona":"...","kind":"anecdote|highlight|joke|quiz_reminder","content":{"move":"challenge|counterfactual|evidence|decision|transfer|reframe|retrieval|wit","push_hook":"...","body":"...","scene_ref":"...","provenance":{"event_id":"...","source_kind":"learner_proposition|agent_proposition|content_presented|new_question"}}}].`;
