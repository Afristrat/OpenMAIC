import { useStageStore } from '@/lib/store/stage';

/**
 * Server-side exports read Postgres, while the editor updates the local store
 * immediately and persists in the background. Flush the current classroom at
 * the export boundary so every format starts from the same edited source.
 */
export async function persistCurrentClassroomForExport(): Promise<void> {
  const { stage, scenes } = useStageStore.getState();
  if (!stage?.id) throw new Error('Classroom introuvable');

  const response = await fetch('/api/classroom', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, scenes }),
  });
  if (!response.ok) throw new Error('Échec de la synchronisation avant export');
}
