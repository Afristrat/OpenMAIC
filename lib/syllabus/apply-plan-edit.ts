import { completeMissingVoices } from '@/lib/audio/complete-missing-voices';
import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { persistCurrentClassroomForExport } from '@/lib/export/persist-before-server-export';
import { createLogger } from '@/lib/logger';
import { useStageStore } from '@/lib/store/stage';
import type { ClassroomPlan } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import { reconcileScenes, type ReconciledScenes } from '@/lib/syllabus/plan-diff';

const log = createLogger('ProgrammeEdit');

export class PlanSaveError extends Error {
  constructor() {
    super('The syllabus could not be saved');
  }
}

/** Enregistre le plan modifié côté serveur. Rien n'est touché dans la salle de cours tant que cet appel n'a pas réussi. */
export async function savePlan(stageId: string, plan: ClassroomPlan): Promise<void> {
  const response = await fetch('/api/classroom/plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: stageId, plan }),
  });
  if (!response.ok) throw new PlanSaveError();
}

/**
 * Donne une voix aux répliques des scènes qui viennent d'être régénérées. Un échec n'est pas bloquant : le bandeau
 * « voix manquantes » de la salle de cours reste disponible pour les compléter.
 */
async function completeVoices(stageId: string): Promise<void> {
  if (summarizeSpeechAudio(useStageStore.getState().scenes).missing === 0) return;
  await persistCurrentClassroomForExport();
  const result = await completeMissingVoices(
    stageId,
    useStageStore.getState().scenes,
    () => undefined,
  );
  for (const updated of result.updatedScenes) {
    useStageStore.getState().updateScene(updated.id, { actions: updated.actions });
  }
}

/**
 * Remet en place l'ancienne scène de chaque entrée modifiée dont la régénération n'a pas abouti (aucune scène à son
 * rang), et la retire de la liste des échecs : elle n'a plus à être regénérée seule, ce qui créerait un doublon.
 * Retourne le nombre de scènes remises en place.
 */
function restorePreviousScenes(stageId: string, replaced: Scene[]): number {
  let restored = 0;
  for (const scene of replaced) {
    const state = useStageStore.getState();
    if (state.stage?.id !== stageId) return restored;
    if (state.scenes.some((existing) => existing.order === scene.order)) continue;
    // Une génération encore en cours pour ce rang (autre passe déjà lancée) livrera sa propre scène.
    if (state.generatingOutlines.some((outline) => outline.order === scene.order)) continue;
    state.addScene(scene);
    const failed = state.outlines.find((outline) => outline.order === scene.order);
    if (failed) state.retryFailedOutline(failed.id);
    restored += 1;
  }
  if (restored > 0) useStageStore.getState().markGenerationCompleteIfDone();
  return restored;
}

/**
 * Met la salle de cours en accord avec le plan modifié : les scènes inchangées ou seulement déplacées sont
 * conservées et renumérotées, celles des entrées supprimées ou modifiées sont retirées. Les entrées ajoutées
 * ou modifiées restent sans scène : `regenerate` les génère, une à une, avec les reprises sur échec habituelles,
 * puis leurs voix sont complétées. La génération se poursuit après le retour de la fonction : l'écran n'attend pas.
 */
export async function applyPlanEdit(input: {
  stageId: string;
  previous: ClassroomPlan;
  next: ClassroomPlan;
  regenerate: (() => Promise<void>) | null;
  /** Appelé quand une régénération a échoué et que l'ancienne version de `count` scènes a été remise en place. */
  onKeptPrevious?: (count: number) => void;
}): Promise<ReconciledScenes> {
  const { stageId, previous, next, regenerate, onKeptPrevious } = input;
  await savePlan(stageId, next);

  const store = useStageStore.getState();
  // Les scènes se rattachent au plan par leur rang dans le plan courant de la salle, pas dans le plan enregistré.
  const orderById = new Map(store.outlines.map((outline) => [outline.id, outline.order]));
  const result = reconcileScenes({
    previous: previous.outlines,
    next: next.outlines,
    scenes: store.scenes,
    sceneOrderOf: (outline) => orderById.get(outline.id) ?? outline.order,
  });

  if (store.mode === 'edit') store.setMode('playback');
  if (store.stage && store.stage.name !== next.courseTitle) {
    store.updateStage({ name: next.courseTitle });
  }
  store.setOutlines(result.outlines);
  store.setScenes(result.keptScenes);
  const current = useStageStore.getState();
  if (!result.keptScenes.some((scene) => scene.id === current.currentSceneId)) {
    current.setCurrentSceneId(result.keptScenes[0]?.id ?? null);
  }
  store.setGenerationComplete(result.pending.length === 0);

  if (result.pending.length > 0 && regenerate) {
    void regenerate()
      .catch((error: unknown) => log.warn('Regeneration after a syllabus edit failed', error))
      .then(() => {
        const kept = restorePreviousScenes(stageId, result.replaced);
        if (kept > 0) onKeptPrevious?.(kept);
      })
      .then(() => completeVoices(stageId))
      .catch((error: unknown) => log.warn('Voice completion after a syllabus edit failed', error));
  }
  return result;
}
