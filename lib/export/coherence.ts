/**
 * Contrôle de cohérence entre ce qui est dit et ce qui est montré : pour une scène, la voix off
 * (le texte exact que la synthèse prononce) est confrontée à l'image que l'apprenant voit.
 * Le texte de la voix étant connu, il n'y a pas à transcrire l'audio pour juger le contenu.
 */

import { parseJsonResponse } from '@/lib/generation/json-repair';

export type CoherenceVerdict = 'coherent' | 'partial' | 'incoherent';

export type CoherenceProblem = { quote: string; reason: string };

export type SceneCoherence = { verdict: CoherenceVerdict; problems: CoherenceProblem[] };

export type CoherenceLanguage = 'fr' | 'en' | 'ar';

const MAX_PROBLEMS = 5;
const MAX_NARRATION = 3000;
const LANGUAGE_NAMES: Record<CoherenceLanguage, string> = {
  fr: 'French',
  en: 'English',
  ar: 'Modern Standard Arabic',
};

/** Voix off d'une scène : les prises de parole, dans l'ordre, telles que la synthèse les dit. */
export function narrationOf(actions: unknown): string {
  if (!Array.isArray(actions)) return '';
  return actions
    .flatMap((action: unknown) => {
      if (!action || typeof action !== 'object') return [];
      const { type, text } = action as { type?: unknown; text?: unknown };
      return type === 'speech' && typeof text === 'string' && text.trim() ? [text.trim()] : [];
    })
    .join('\n')
    .slice(0, MAX_NARRATION);
}

export function coherencePrompt(
  narration: string,
  language: CoherenceLanguage,
): { system: string; prompt: string } {
  return {
    system: `You check that what a narrator says matches what the learner sees on a slide image.
You receive the narration (what is spoken aloud, in order) and the image of the slide. Judge only the factual match between the two: does the narration describe, name or point to things that are visible on the image, and is anything it states about the screen false or absent?
- "coherent": everything the narration says about what is on screen is visible and true.
- "partial": some elements the narration mentions are not visible, or only loosely match.
- "incoherent": the narration describes something that is absent from the image or contradicted by it.
Do not judge style, pedagogy or spelling. A narration that adds general explanation without claiming anything about the screen is coherent.
Return only one JSON object: {"verdict":"coherent"|"partial"|"incoherent","problems":[{"quote":"<exact fragment of the narration>","reason":"<what the image shows instead>"}]}. The list is empty when the verdict is "coherent". At most ${MAX_PROBLEMS} problems. Write the reasons in ${LANGUAGE_NAMES[language]}. Never use em dashes.`,
    prompt: `Narration:\n${narration}`,
  };
}

/** Verdict de l'IA validé ; null si la réponse est illisible, jamais une valeur devinée. */
export function parseCoherence(text: string): SceneCoherence | null {
  const parsed = parseJsonResponse<{ verdict?: unknown; problems?: unknown }>(text);
  if (!parsed) return null;
  const verdict = parsed.verdict;
  if (verdict !== 'coherent' && verdict !== 'partial' && verdict !== 'incoherent') return null;
  const problems: CoherenceProblem[] = [];
  if (Array.isArray(parsed.problems)) {
    for (const entry of parsed.problems) {
      if (!entry || typeof entry !== 'object') continue;
      const { quote, reason } = entry as Record<string, unknown>;
      if (typeof quote !== 'string' || typeof reason !== 'string') continue;
      if (!quote.trim() || !reason.trim()) continue;
      problems.push({ quote: quote.trim().slice(0, 300), reason: reason.trim().slice(0, 400) });
      if (problems.length >= MAX_PROBLEMS) break;
    }
  }
  // Un verdict de désaccord sans aucun grief écrit n'est pas exploitable par l'auteur.
  if (verdict !== 'coherent' && problems.length === 0) return null;
  return { verdict, problems: verdict === 'coherent' ? [] : problems };
}
