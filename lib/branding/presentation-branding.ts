export type PresentationBrandMode = 'none' | 'organization' | 'qalem' | 'both';

export interface PresentationBranding {
  readonly mode: PresentationBrandMode;
  /**
   * A stable, browser-renderable URL for the client mark shown on the slides:
   * the classroom's own logo when it has one, otherwise the organisation logo.
   */
  readonly organizationLogoUrl?: string;
}

const MODES: readonly PresentationBrandMode[] = ['none', 'organization', 'qalem', 'both'];

export const DEFAULT_PRESENTATION_BRANDING: PresentationBranding = {
  mode: 'organization',
};

/**
 * A classroom logo is an explicit author choice for that classroom (for example
 * the client's mark on a commissioned course): it must stay visible even when the
 * organisation policy hides the organisation mark, so the policy is widened to the
 * nearest mode that shows it.
 */
const MODE_WITH_CLASSROOM_LOGO: Record<PresentationBrandMode, PresentationBrandMode> = {
  none: 'organization',
  organization: 'organization',
  qalem: 'both',
  both: 'both',
};

/**
 * Reads the presentation identity defensively. Logos remain first-class fields
 * (`organizations.logo`, `stages.logo`); settings only stores the display policy.
 * The classroom logo, when present, replaces the organisation logo.
 */
export function presentationBrandingFromOrganization(
  logo: string | null | undefined,
  settings: Record<string, unknown> | null | undefined,
  classroomLogo?: string | null,
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
  const classroomLogoUrl = classroomLogo?.trim();
  if (classroomLogoUrl) {
    return { mode: MODE_WITH_CLASSROOM_LOGO[mode], organizationLogoUrl: classroomLogoUrl };
  }
  const organizationLogoUrl = logo?.trim();
  return organizationLogoUrl ? { mode, organizationLogoUrl } : { mode };
}

export function presentationBrandingSettings(mode: PresentationBrandMode): Record<string, unknown> {
  return { mode };
}
