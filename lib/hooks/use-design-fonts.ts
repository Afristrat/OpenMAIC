'use client';

import { useEffect } from 'react';
import { useStageStore } from '@/lib/store';
import { DESIGN_FONT_LOADERS } from '@/lib/fonts/design-font-loaders';

const requested = new Set<string>();

/** Loads, once each, the design fonts named by the slides of the current stage. */
export function useDesignFonts(): void {
  const scenes = useStageStore((state) => state.scenes);
  useEffect(() => {
    const serialized = scenes.map((scene) => JSON.stringify(scene.content ?? '')).join('');
    for (const [font, load] of Object.entries(DESIGN_FONT_LOADERS)) {
      if (requested.has(font) || !serialized.includes(font)) continue;
      requested.add(font);
      void load().catch(() => requested.delete(font));
    }
  }, [scenes]);
}
