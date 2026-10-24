/** Avertissements structurés d'une génération réussie mais incomplète. */
export interface ClassroomGenerationWarnings {
  /** Prises de parole du cours enregistré qui n'ont pas de voix. */
  ttsMissing: number;
  /** Prises de parole du cours qui devaient porter une voix. */
  ttsRequested: number;
  /** Vrai quand l'arrêt vient d'un solde de crédits épuisé : recharger avant de régénérer. */
  ttsCreditsBlocked?: boolean;
}

export type TtsOutcome =
  | { kind: 'ok' }
  | { kind: 'partial'; missing: number; total: number; creditsBlocked: boolean }
  | { kind: 'total_failure'; creditsBlocked: boolean; message: string };

/**
 * Seuil : une heure de génération ne se perd pas pour quelques pistes muettes, mais un cours
 * voisé à la demande dont AUCUNE piste n'existe (fournisseur absent, clé invalide, solde épuisé
 * d'emblée) révèle une panne de configuration que l'auteur doit connaître avant d'enregistrer.
 * Une seule piste générée prouve que la chaîne vocale fonctionne : le reste se complète ensuite
 * avec l'outil « Générer les voix manquantes ».
 */
export function evaluateTtsOutcome(
  report: { requested: number; generated: number; creditsBlocked?: boolean },
  speech: { speech: number; missing: number },
): TtsOutcome {
  if (speech.missing === 0) return { kind: 'ok' };
  const creditsBlocked = report.creditsBlocked === true;
  if (report.generated > 0) {
    return { kind: 'partial', missing: speech.missing, total: speech.speech, creditsBlocked };
  }
  // Sans fournisseur serveur, le générateur rapporte 0 demandée : seules les répliques
  // restées muettes disent la vérité.
  const message =
    report.requested > 0
      ? `TTS persistence incomplete: ${report.generated}/${report.requested} speech actions generated`
      : `TTS incomplete: ${speech.missing} speech lines have no audio`;
  return { kind: 'total_failure', creditsBlocked, message };
}
