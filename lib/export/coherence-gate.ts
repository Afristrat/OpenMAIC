import type { SceneCoherenceReport } from './coherence';

/**
 * Scènes qui empêchent la publication : jugées incohérentes par le dernier contrôle et non modifiées
 * depuis. Une scène retouchée par l'auteur n'est plus couverte par ce verdict, elle ne bloque plus.
 */
export function blockingScenes(
  reports: SceneCoherenceReport[],
  sceneUpdatedAt: Map<string, string | null>,
  checkedAt: string,
): SceneCoherenceReport[] {
  const checked = Date.parse(checkedAt);
  return reports.filter((report) => {
    if (report.verdict !== 'incoherent') return false;
    const updated = sceneUpdatedAt.get(report.sceneId);
    // Scène disparue : le verdict ne porte plus sur rien.
    if (updated === undefined) return false;
    return !updated || Date.parse(updated) <= checked;
  });
}
