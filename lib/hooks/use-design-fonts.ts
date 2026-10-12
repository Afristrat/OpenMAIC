'use client';

import { useEffect } from 'react';
import { DESIGN_FONTS } from '@openmaic/dsl';
import { useStageStore } from '@/lib/store';

let requested: Promise<unknown> | null = null;

/** Loads the design font faces once a slide of the stage names one of the authorized fonts. */
export function useDesignFonts(): void {
  const scenes = useStageStore((state) => state.scenes);
  useEffect(() => {
    if (requested) return;
    const serialized = scenes.map((scene) => JSON.stringify(scene.content ?? '')).join('');
    if (DESIGN_FONTS.some((font) => serialized.includes(font))) {
      requested = import('@/lib/fonts/design-font-faces');
    }
  }, [scenes]);
}
