import { z } from 'zod';
import { parseJsonResponse } from '@/lib/generation/json-repair';

export const ANCHOR_SEED_PROMPT_VERSION = 'P3-B-v1';

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
  context: { personas: string[]; sceneRefs: string[] },
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
    counts[seed.kind] += 1;
  }
  if (counts.anecdote < 4 || counts.highlight < 4 || counts.joke < 2 || counts.quiz_reminder < 2) {
    throw new Error('Incomplete P3-B seed distribution');
  }
  return parsed;
}

export function buildSeedStockPrompt(input: {
  language: string;
  personas: string[];
  events: unknown[];
}): string {
  return `<prompt_version>${ANCHOR_SEED_PROMPT_VERSION}</prompt_version>
<language>${input.language}</language>
<casting>${JSON.stringify(input.personas)}</casting>
<session_events>${JSON.stringify(input.events)}</session_events>`;
}

export const ANCHOR_SEED_SYSTEM_PROMPT = `Tu es l'équipe pédagogique d'une session de formation qui vient de se terminer.
À partir du résumé de session fourni, génère un stock de graines d'ancrage mémoriel.
Chaque graine est signée par une personnalité du casting et cite une scene_ref fournie.
Produis au minimum 4 anecdotes, 4 highlights, 2 jokes et 2 quiz_reminder.
Accroche push de 90 caractères maximum, corps de 60 mots maximum, dans la langue fournie.
En arabe, utilise l'arabe standard moderne. En français, emploie des accents irréprochables.
Toute promotion commerciale, culpabilisation ou comparaison à d'autres apprenants est interdite.
Retourne uniquement un tableau JSON conforme à [{"persona":"...","kind":"anecdote|highlight|joke|quiz_reminder","content":{"push_hook":"...","body":"...","scene_ref":"..."}}].`;
