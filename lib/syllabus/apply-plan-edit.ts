import { completeMissingVoices } from '@/lib/audio/complete-missing-voices';
import { summarizeSpeechAudio } from '@/lib/audio/speech-audio-report';
import { persistCurrentClassroomForExport } from '@/lib/export/persist-before-server-export';
import { createLogger } from '@/lib/logger';
import { useStageStore } from '@/lib/store/stage';
import type { ClassroomPlan } from '@/lib/types/generation';
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
}): Promise<ReconciledScenes> {
  const { stageId, previous, next, regenerate } = input;
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
      .then(() => completeVoices(stageId))
      .catch((error: unknown) => log.warn('Regeneration after a syllabus edit failed', error));
  }
  return result;
}
