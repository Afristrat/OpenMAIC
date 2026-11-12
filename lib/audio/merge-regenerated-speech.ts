import type { Action } from '@/lib/types/action';
import { isSilentSpeech } from './speech-audio-report';

/**
 * Vrai si `id` désigne la prise de parole `actionId` ou l'un des morceaux que le découpage
 * serveur en tire (`X_tts_N` pour une ligne trop longue, `X_lang_N` pour un anglicisme, et
 * leurs combinaisons comme `X_lang_1_tts_2`), cf. lib/audio/tts-utils.ts.
 */
export function isRegeneratedSpeechPiece(id: string | undefined, actionId: string): boolean {
  if (!id) return false;
  if (id === actionId) return true;
  return id.startsWith(`${actionId}_tts_`) || id.startsWith(`${actionId}_lang_`);
}

/**
 * Insère dans les actions ACTUELLES d'une scène la seule ligne dont la voix vient d'être
 * synthétisée, avec ses éventuels morceaux, et rien d'autre. La synthèse dure plusieurs
 * secondes : pendant ce temps, l'auteur a pu modifier d'autres lignes, ou cette ligne même.
 * Remplacer toute la scène par la copie renvoyée effacerait ces modifications.
 *
 * Retourne `null` quand rien ne doit être écrit : la ligne a disparu, son texte n'est plus celui
 * qui a été synthétisé (la voix ne lui correspond plus), ou la réponse ne contient aucun morceau.
 */
export function mergeRegeneratedSpeech(
  current: readonly Action[],
  generated: readonly Action[],
  actionId: string,
  sentText: string,
): Action[] | null {
  const index = current.findIndex((action) => action.id === actionId);
  const line = current[index];
  if (!line || line.type !== 'speech') return null;
  if (line.text.trim() !== sentText.trim()) return null;
  const pieces = generated.filter((action) => isRegeneratedSpeechPiece(action.id, actionId));
  if (pieces.length === 0) return null;
  return [...current.slice(0, index), ...pieces, ...current.slice(index + 1)];
}

/**
 * Applique aux actions actuelles d'une scène les voix complétées par le serveur. `requested`
 * décrit les lignes muettes telles qu'elles ont été envoyées : chacune n'est reprise que si son
 * texte local n'a pas changé depuis.
 */
export function mergeCompletedSpeech(
  current: readonly Action[],
  generated: readonly Action[],
  requested: ReadonlyArray<{ id: string; text: string }>,
): Action[] {
  let next: Action[] = [...current];
  for (const line of requested) {
    const pieces = generated.filter((action) => isRegeneratedSpeechPiece(action.id, line.id));
    // Une ligne restée muette côté serveur n'apporte rien : la copie locale reste la référence.
    if (pieces.length === 0 || pieces.some(isSilentSpeech)) continue;
    next = mergeRegeneratedSpeech(next, pieces, line.id, line.text) ?? next;
  }
  return next;
}

/**
 * Mises à jour à appliquer au store après une complétion des voix manquantes. `sent` est l'état
 * des scènes au moment de la demande (les lignes muettes et leur texte d'alors), `current` l'état
 * actuel du store : seules les lignes dont le texte n'a pas bougé reçoivent leur voix.
 */
export function completedVoiceUpdates(
  sent: ReadonlyArray<{ id: string; actions?: Action[] }>,
  updatedScenes: ReadonlyArray<{ id: string; actions: Action[] }>,
  current: ReadonlyArray<{ id: string; actions?: Action[] }>,
): Array<{ id: string; actions: Action[] }> {
  const updates: Array<{ id: string; actions: Action[] }> = [];
  for (const updated of updatedScenes) {
    const actions = current.find((scene) => scene.id === updated.id)?.actions;
    if (!actions) continue;
    const requested = (sent.find((scene) => scene.id === updated.id)?.actions ?? [])
      .filter(isSilentSpeech)
      .flatMap((action) =>
        action.type === 'speech' ? [{ id: action.id, text: action.text }] : [],
      );
    updates.push({
      id: updated.id,
      actions: mergeCompletedSpeech(actions, updated.actions, requested),
    });
  }
  return updates;
}
