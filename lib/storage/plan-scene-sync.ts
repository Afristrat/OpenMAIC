/**
 * Décide, scène par scène, quelle copie gagne entre la base locale du navigateur et le serveur.
 *
 * Une scène présente seulement en local a deux origines possibles : elle a été créée hors ligne, ou elle a été supprimée
 * ou remplacée sur le serveur depuis la dernière synchronisation (modification du programme, suppression en mode
 * édition, depuis un autre appareil). Le serveur est l'autorité d'une salle de cours qu'il a modifiée plus récemment que la
 * copie locale : dans ce cas la scène locale orpheline est retirée de la copie locale, jamais renvoyée au serveur
 * (elle y réapparaîtrait en double, au même rang que sa remplaçante).
 */
export interface SceneSyncCopy {
  /** Date de dernière modification, en millisecondes. */
  updatedAt: number;
}

export interface SceneSyncPlan {
  pushToRemote: string[];
  pullToLocal: string[];
  deleteFromLocal: string[];
}

export function planSceneSync(input: {
  local: ReadonlyMap<string, SceneSyncCopy>;
  remote: ReadonlyMap<string, SceneSyncCopy>;
  /** Vrai quand la salle de cours du serveur est plus récente que la copie locale. */
  remoteStageIsNewer: boolean;
}): SceneSyncPlan {
  const plan: SceneSyncPlan = { pushToRemote: [], pullToLocal: [], deleteFromLocal: [] };
  const ids = new Set([...input.local.keys(), ...input.remote.keys()]);
  for (const id of ids) {
    const local = input.local.get(id);
    const remote = input.remote.get(id);
    if (local && !remote) {
      if (input.remoteStageIsNewer) plan.deleteFromLocal.push(id);
      else plan.pushToRemote.push(id);
    } else if (!local && remote) {
      plan.pullToLocal.push(id);
    } else if (local && remote) {
      if (local.updatedAt > remote.updatedAt) plan.pushToRemote.push(id);
      else if (remote.updatedAt > local.updatedAt) plan.pullToLocal.push(id);
    }
  }
  return plan;
}
