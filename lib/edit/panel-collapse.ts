import { useCallback, useState } from 'react';

/**
 * État réduit/déployé des barres latérales du mode édition, mémorisé dans
 * localStorage. Réduit par défaut : l'espace revient à la diapositive
 * éditée ; l'utilisateur déploie ce dont il a besoin et son choix est retenu.
 */
export const EDIT_RAIL_COLLAPSED_KEY = 'qalem.edit.railCollapsed';
export const EDIT_AGENT_COLLAPSED_KEY = 'qalem.edit.agentCollapsed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Accès refusé (navigation privée, données de site bloquées).
    return null;
  }
}

/** Lit l'état mémorisé ; toute valeur absente, illisible ou inattendue donne `fallback`. */
export function readCollapsed(
  key: string,
  fallback = true,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    const raw = storage?.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // Lecture impossible : on retombe sur la valeur par défaut.
  }
  return fallback;
}

export function writeCollapsed(
  key: string,
  collapsed: boolean,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(key, collapsed ? '1' : '0');
  } catch {
    // Quota ou accès refusé : l'état reste valable pour la session en cours.
  }
}

/**
 * Passage à l'état déployé quand l'assistant IA démarre ou reçoit un message
 * (front montant de `isRunning` ou de `hasMessages`). Jamais sur mobile, où le
 * panneau est un tiroir ouvert à la demande.
 */
export function shouldAutoExpandAgent(
  prev: { readonly isRunning: boolean; readonly hasMessages: boolean },
  next: { readonly isRunning: boolean; readonly hasMessages: boolean },
  mobileMode: boolean,
): boolean {
  if (mobileMode) return false;
  return (next.isRunning && !prev.isRunning) || (next.hasMessages && !prev.hasMessages);
}

/**
 * `[collapsed, setCollapsed]`. `setCollapsed(next)` mémorise le choix ;
 * `setCollapsed(next, false)` change l'état pour cette session seulement (ouverture
 * automatique : elle ne doit pas écraser la préférence de l'utilisateur).
 */
export function usePanelCollapsed(
  key: string,
): readonly [boolean, (next: boolean, remember?: boolean) => void] {
  const [collapsed, setState] = useState<boolean>(() => readCollapsed(key));
  const setCollapsed = useCallback(
    (next: boolean, remember = true) => {
      setState(next);
      if (remember) writeCollapsed(key, next);
    },
    [key],
  );
  return [collapsed, setCollapsed] as const;
}
