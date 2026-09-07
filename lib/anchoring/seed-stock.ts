import { z } from 'zod';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { LearningApproach } from '@/lib/agents/persona-catalog';

export const ANCHOR_SEED_PROMPT_VERSION = 'P3-B-v3';

const ANDRAGOGY_EVALUATIVE_LANGUAGE =
  /\b(bravo|bien joué|sage décision|continue sur cette lancée|mieux que (?:la plupart|les autres)|exactement (?:le bon|la bonne)|bon niveau d['’]engagement)\b/iu;

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
  }),
});

export type AnchorSeed = z.infer<typeof seedSchema>;

export function parseSeedStock(
  text: string,
  context: {
    learningApproach: LearningApproach;
    personas: string[];
    sceneRefs: string[];
  },
): AnchorSeed[] {
  const parsed = z.array(seedSchema).min(12).parse(parseJsonResponse<unknown>(text));
  const personas = new Set(context.personas);
  const sceneRefs = new Set(context.sceneRefs);
  const counts = { anecdote: 0, highlight: 0, joke: 0, quiz_reminder: 0 };

  for (const seed of parsed) {
    if (!personas.has(seed.persona)) throw new Error(`Unknown casting persona: ${seed.persona}`);
    if (!sceneRefs.has(seed.content.scene_ref)) {
      throw new Error(`Unknown session scene: ${seed.content.scene_ref}`);
    }
    if (
      context.learningApproach === 'andragogy' &&
      ANDRAGOGY_EVALUATIVE_LANGUAGE.test(`${seed.content.push_hook} ${seed.content.body}`)
    ) {
      throw new Error('Evaluative or comparative language is forbidden in andragogy');
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
  personas: string[];
  events: unknown[];
}): string {
  return `<prompt_version>${ANCHOR_SEED_PROMPT_VERSION}</prompt_version>
<language>${input.language}</language>
<learning_approach>${input.learningApproach}</learning_approach>
<casting>${JSON.stringify(input.personas)}</casting>
<session_events>${JSON.stringify(input.events)}</session_events>`;
}

export const ANCHOR_SEED_SYSTEM_PROMPT = `Tu conçois les relances d'une session de formation qui vient de se terminer.
À partir du résumé de session fourni, génère un stock de graines d'ancrage mémoriel.
Chaque graine est signée par une personnalité du casting et cite une scene_ref fournie.
Respecte strictement learning_approach :
- andragogy : adulte traité en pair autonome ; partir de son expérience, de ses problèmes réels et d'un transfert immédiatement applicable ; bannir tout ton scolaire, infantilisant ou toute félicitation vague ;
- pedagogy : guidage explicite, progression structurée et étayage adapté à un apprenant qui a besoin d'être accompagné ;
- hybrid : partir de l'expérience tout en apportant seulement le guidage nécessaire.
Produis au minimum 4 anecdotes, 4 highlights, 2 jokes et 2 quiz_reminder.
Accroche push de 90 caractères maximum, corps de 60 mots maximum, dans la langue fournie.
En arabe, utilise l'arabe standard moderne. En français, emploie des accents irréprochables.
Toute promotion commerciale, culpabilisation ou comparaison à d'autres apprenants est interdite.
En andragogie, ne félicite et n'évalue jamais l'adulte, même sous forme d'humour. Sont notamment interdits : « bravo », « bien joué », « sage décision », « mieux que les autres », « bon niveau d'engagement ». L'humour vise uniquement la situation, jamais la personne. N'invente ni devise, ni pays, ni contexte absent des événements.
Retourne uniquement un tableau JSON conforme à [{"persona":"...","kind":"anecdote|highlight|joke|quiz_reminder","content":{"push_hook":"...","body":"...","scene_ref":"..."}}].`;
