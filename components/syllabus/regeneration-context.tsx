'use client';

import { createContext, useContext } from 'react';

/**
 * Régénère les scènes du plan qui n'ont pas (ou plus) de scène : ajoutées ou modifiées depuis l'éditeur de
 * programme. Fournie par la salle de cours, qui porte le générateur de scènes et ses reprises sur échec.
 */
export type RegeneratePendingScenes = () => Promise<void>;

const RegenerationContext = createContext<RegeneratePendingScenes | null>(null);

export const SceneRegenerationProvider = RegenerationContext.Provider;

export function useRegeneratePendingScenes(): RegeneratePendingScenes | null {
  return useContext(RegenerationContext);
}
