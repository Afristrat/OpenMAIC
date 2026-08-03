export type PresentationBrandMode = 'none' | 'organization' | 'qalem' | 'both';

export interface PresentationBranding {
  readonly mode: PresentationBrandMode;
  /** A stable, browser-renderable URL for the organisation mark. */
  readonly organizationLogoUrl?: string;
}

const MODES: readonly PresentationBrandMode[] = ['none', 'organization', 'qalem', 'both'];

export const DEFAULT_PRESENTATION_BRANDING: PresentationBranding = {
  mode: 'organization',
};

/**
 * Reads the tenant-wide presentation identity defensively. The organisation
 * logo itself remains a first-class organisation field; settings only stores
 * the display policy. This avoids copying logos into every classroom.
 */
export function presentationBrandingFromOrganization(
  logo: string | null | undefined,
  settings: Record<string, unknown> | null | undefined,
): PresentationBranding {
  const raw = settings?.presentationBranding;
  const mode =
    raw &&
    typeof raw === 'object' &&
    'mode' in raw &&
    typeof (raw as { mode?: unknown }).mode === 'string' &&
    MODES.includes((raw as { mode: PresentationBrandMode }).mode)
      ? (raw as { mode: PresentationBrandMode }).mode
      : DEFAULT_PRESENTATION_BRANDING.mode;
  const organizationLogoUrl = logo?.trim();
  return organizationLogoUrl ? { mode, organizationLogoUrl } : { mode };
}

export function presentationBrandingSettings(mode: PresentationBrandMode): Record<string, unknown> {
  return { mode };
}
