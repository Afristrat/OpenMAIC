'use client';

import { useStageStore } from '@/lib/store';
import type { PresentationBranding } from '@/lib/branding/presentation-branding';

function isVisible(branding: PresentationBranding, mark: 'organization' | 'qalem'): boolean {
  return branding.mode === mark || branding.mode === 'both';
}

/**
 * Non-destructive presentation identity layer. It deliberately sits outside
 * the editable slide document: changing a tenant brand updates every
 * classroom without mutating authored content or duplicating image elements.
 */
export function PresentationBrandMark() {
  const branding = useStageStore((state) => state.stage?.presentationBranding);
  if (!branding || branding.mode === 'none') return null;

  const showOrganization = !!branding.organizationLogoUrl && isVisible(branding, 'organization');
  const showQalem = isVisible(branding, 'qalem');
  if (!showOrganization && !showQalem) return null;

  return (
    <div
      aria-label="Identité de la présentation"
      className="pointer-events-none absolute bottom-3 right-4 z-[70] flex max-w-[30%] items-center gap-2 rounded-full bg-white/85 px-2.5 py-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-zinc-950/80 dark:ring-white/10"
    >
      {showOrganization && (
        <img
          src={branding.organizationLogoUrl}
          alt="Logo de l’organisation"
          className="max-h-7 max-w-24 object-contain"
        />
      )}
      {showOrganization && showQalem && <span className="h-5 w-px bg-zinc-300/80 dark:bg-zinc-700" />}
      {showQalem && (
        <span className="text-sm font-bold tracking-tight text-violet-700 dark:text-violet-300">Qalem</span>
      )}
    </div>
  );
}
