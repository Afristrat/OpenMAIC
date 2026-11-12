import {
  flushClassroomPersistence,
  hasActiveClassroomPersistence,
} from '@/lib/edit/classroom-persistence';
import { useStageStore } from '@/lib/store/stage';

/**
 * Server-side exports read Postgres, while the editor updates the local store
 * immediately and persists in the background. Flush the current classroom at
 * the export boundary so every format starts from the same edited source.
 *
 * Quand l'éditeur tient une file d'enregistrement, l'envoi passe par elle : un PUT
 * parallèle pourrait arriver après un enregistrement plus récent et le remplacer
 * par une copie plus ancienne. Sans file active, aucune course n'est possible et
 * la formation est envoyée directement, comme avant.
 */
export async function persistCurrentClassroomForExport(): Promise<void> {
  const { stage, scenes } = useStageStore.getState();
  if (!stage?.id) throw new Error('Classroom introuvable');

  if (hasActiveClassroomPersistence()) {
    if (!(await flushClassroomPersistence())) {
      throw new Error('Échec de la synchronisation avant export');
    }
    return;
  }

  const response = await fetch('/api/classroom', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, scenes }),
  });
  if (!response.ok) throw new Error('Échec de la synchronisation avant export');
}
