import { flushClassroomPersistence } from '@/lib/edit/classroom-persistence';
import { useStageStore } from '@/lib/store/stage';

/**
 * Server-side exports read Postgres, while the editor updates the local store
 * immediately and persists in the background. Flush the current classroom at
 * the export boundary so every format starts from the same edited source.
 *
 * L'envoi passe par la file d'enregistrement de l'éditeur : un PUT parallèle
 * pourrait arriver après un enregistrement plus récent et le remplacer par une
 * copie plus ancienne.
 */
export async function persistCurrentClassroomForExport(): Promise<void> {
  const { stage } = useStageStore.getState();
  if (!stage?.id) throw new Error('Classroom introuvable');
  if (!(await flushClassroomPersistence())) {
    throw new Error('Échec de la synchronisation avant export');
  }
}
