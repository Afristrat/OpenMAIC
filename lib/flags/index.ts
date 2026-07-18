/**
 * Feature flags — chantier 0 (SOCLE).
 *
 * Table `feature_flags` (docs/foundation/0-socle/02-data-dictionary.md ;
 * migration supabase/migrations/00019_feature_flags.sql). RLS : lecture
 * authentifiée, écriture réservée au rôle service — ce helper ne fait que
 * lire, via le client service (bypass RLS), afin de fonctionner aussi bien
 * en contexte API route qu'en job d'arrière-plan (BullMQ).
 *
 * Les chantiers 1-3 s'appuient dessus pour livrer en continu sur la base
 * unique plutôt que via des branches longues (ADR-006, dossier 0/08).
 *
 * Pas de granularité org/user pour l'instant : la colonne `scope` reste
 * informative tant qu'aucun chantier n'a un besoin réel d'activation
 * partielle (YAGNI, cf. data-dictionary — condition de sortie du parking
 * lot documentée là-bas).
 */

import { createLogger } from '@/lib/logger';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('FeatureFlags');

/** Lit l'état `enabled` d'un flag en base. `null` = absent ou erreur de lecture. */
export type FlagReader = (flagName: string) => Promise<boolean | null>;

async function readFlagFromSupabase(flagName: string): Promise<boolean | null> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', flagName)
      .maybeSingle();

    if (error) {
      log.warn('Failed to read feature flag', { flagName, error: error.message });
      return null;
    }

    return data?.enabled ?? null;
  } catch (error) {
    log.warn('Feature flag store unavailable', {
      flagName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Vérifie si un feature flag est actif.
 *
 * Fail-closed : un flag absent de la table, ou une erreur de lecture,
 * retourne `false` — un flag manquant ou illisible ne doit jamais débloquer
 * un comportement non revu (cohérent avec le comportement "éteint" par
 * défaut attendu par les stories des chantiers 1-3).
 *
 * `reader` est injectable pour les tests (évite de mocker toute la chaîne
 * Supabase) ; en production, le lecteur par défaut interroge la table via
 * le client service.
 */
export async function isFeatureEnabled(
  flagName: string,
  reader: FlagReader = readFlagFromSupabase,
): Promise<boolean> {
  const enabled = await reader(flagName);
  return enabled ?? false;
}
