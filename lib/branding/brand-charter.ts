import {
  organizationDesignSystemFromSettings,
  serializeBrandSnapshot,
} from './organization-design-system';
import { snapshotDesignTokens, type BrandColors } from './design-directive';

/**
 * The charter a tenant imposes on its courses: the colours and fonts of its own site. When it
 * exists, the author cannot override them in the plan editor; they are shown, never edited.
 */
export interface BrandCharter {
  sourceUrl: string;
  colors: BrandColors;
  headingFont?: string;
  bodyFont?: string;
}

/** The charter of an organization, read from its saved settings; null for a tenant without one. */
export function brandCharterFromSettings(settings: unknown): BrandCharter | null {
  const design = organizationDesignSystemFromSettings(settings);
  if (!design) return null;
  const content = serializeBrandSnapshot(design).text;
  const tokens = snapshotDesignTokens({ version: 1, createdAt: design.extractedAt, content });
  if (!tokens.colors.accent && !tokens.colors.background) return null;
  return {
    sourceUrl: design.sourceUrl,
    colors: tokens.colors,
    ...(tokens.fontName ? { headingFont: tokens.fontName } : {}),
    ...(tokens.bodyFontName ? { bodyFont: tokens.bodyFontName } : {}),
  };
}
