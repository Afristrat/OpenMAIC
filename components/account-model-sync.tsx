'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * Recopie côté serveur le modèle que l'auteur utilise dans son compte, au chargement et à chaque
 * changement. L'extension de capture n'a pas d'autre moyen de le connaître : elle ne le choisit pas.
 * L'attente de 800 ms laisse passer la restauration des réglages locaux avant d'écrire.
 */
export function AccountModelSync(): null {
  const modelString = useSettingsStore((state) => `${state.providerId}:${state.modelId}`);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/account/model', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelString }),
      }).catch(() => {
        // Hors ligne ou refus : la prochaine ouverture ou le prochain changement réessaie.
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [modelString]);

  return null;
}
