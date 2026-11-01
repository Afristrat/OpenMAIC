/**
 * Publication de formations dans la bibliothèque partagée d'une organisation, en un seul geste.
 *
 * Les droits ne sont pas décidés ici : le déclencheur `guard_share` de la base refuse toute
 * publication hors des rôles admin, manager ou formateur, et hors des formations dont l'acteur est
 * propriétaire (ou admin/manager de l'organisation source). Un refus remonte comme `denied`,
 * formation par formation, sans bloquer les autres.
 */

export type PublishOutcome = 'published' | 'already' | 'denied' | 'failed';

export interface PublishResult {
  stageId: string;
  outcome: PublishOutcome;
}

export interface ExistingShare {
  id: string;
  stageId: string;
  visibility: string;
}

export interface ShareRepository {
  /** Partages déjà présents dans la bibliothèque de l'organisation pour ces formations. */
  listExisting(orgId: string, stageIds: readonly string[]): Promise<ExistingShare[]>;
  /** Retourne le code d'erreur de la base (`42501` = refus de droits), ou null si l'insertion a réussi. */
  insert(orgId: string, stageId: string): Promise<string | null>;
  /** Rend visible à l'organisation un partage resté privé. Même contrat que `insert`. */
  makeVisibleToOrganization(shareId: string): Promise<string | null>;
}

const PERMISSION_DENIED = '42501';

function toOutcome(errorCode: string | null, success: PublishOutcome): PublishOutcome {
  if (errorCode === null) return success;
  return errorCode === PERMISSION_DENIED ? 'denied' : 'failed';
}

export async function publishStagesToLibrary(
  repository: ShareRepository,
  orgId: string,
  stageIds: readonly string[],
): Promise<PublishResult[]> {
  const unique = [...new Set(stageIds)];
  if (unique.length === 0) return [];

  const existing = new Map(
    (await repository.listExisting(orgId, unique)).map((share) => [share.stageId, share]),
  );

  const results: PublishResult[] = [];
  for (const stageId of unique) {
    const share = existing.get(stageId);
    if (share && share.visibility !== 'private') {
      results.push({ stageId, outcome: 'already' });
      continue;
    }
    const errorCode = share
      ? await repository.makeVisibleToOrganization(share.id)
      : await repository.insert(orgId, stageId);
    results.push({ stageId, outcome: toOutcome(errorCode, 'published') });
  }
  return results;
}

export function summarizePublication(
  results: readonly PublishResult[],
): Record<PublishOutcome, number> {
  const summary: Record<PublishOutcome, number> = {
    published: 0,
    already: 0,
    denied: 0,
    failed: 0,
  };
  for (const result of results) summary[result.outcome] += 1;
  return summary;
}
