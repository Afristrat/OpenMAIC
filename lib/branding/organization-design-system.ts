export interface BrandColorToken {
  name: 'background' | 'surface' | 'ink' | 'accent' | 'muted' | 'secondary';
  hex: string;
  purpose: string;
}

export interface OrganizationDesignSystem {
  version: 1;
  sourceUrl: string;
  extractedAt: string;
  logoUrl?: string;
  palette: BrandColorToken[];
  typography: {
    display: string;
    body: string;
    utility: string;
  };
  spacingRhythm: string;
  cornerRadius: string;
  borderAndShadow: string;
  density: string;
  layoutLogic: string;
  signatureElement: string;
  never: string[];
  inferred: string[];
}

export interface SerializedBrandSnapshot {
  text: string;
  warnings: string[];
}

const MAX_BRAND_SNAPSHOT_LENGTH = 1200;
const COLOR_NAMES = new Set(['background', 'surface', 'ink', 'accent', 'muted', 'secondary']);

function cleanText(value: unknown, maxLength = 240): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function mapFont(requested: unknown, role: string, warnings: string[]): string {
  const original = cleanText(requested, 80);
  const exact = DESIGN_FONTS.find((font) => font.toLowerCase() === original.toLowerCase());
  if (exact) return exact;

  const normalized = original.toLowerCase();
  const mapped = /mono|code|console/.test(normalized)
    ? 'JetBrains Mono'
    : /serif|times|georgia|garamond|book/.test(normalized)
      ? 'Merriweather'
      : 'Inter';
  if (original) warnings.push(`Charte : police ${role} « ${original} » remplacée par ${mapped}.`);
  return mapped;
}

function normalizedHex(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = tinycolor(value);
  if (!parsed.isValid()) return undefined;
  return `#${parsed.toHex().toUpperCase()}`;
}

function readableForeground(
  foreground: string,
  backgrounds: string[],
  role: string,
  warnings: string[],
): string {
  if (backgrounds.every((background) => tinycolor.readability(foreground, background) >= 4.5)) {
    return foreground;
  }

  const original = tinycolor(foreground);
  for (let step = 1; step <= 100; step += 1) {
    for (const adjusted of [original.clone().darken(step), original.clone().lighten(step)]) {
      const candidate = `#${adjusted.toHex().toUpperCase()}`;
      if (backgrounds.every((background) => tinycolor.readability(candidate, background) >= 4.5)) {
        warnings.push(
          `Charte : contraste insuffisant pour ${role} ; luminosité ajustée (${foreground} → ${candidate}).`,
        );
        return candidate;
      }
    }
  }
  const fallback = backgrounds.every(
    (background) => tinycolor.readability('#000000', background) >= 4.5,
  )
    ? '#000000'
    : '#FFFFFF';
  warnings.push(
    `Charte : contraste de ${role} impossible à préserver ; couleur sûre ${fallback} appliquée.`,
  );
  return fallback;
}

/** Deterministic compact serialization of tenant branding for a frozen course snapshot. */
export function serializeBrandSnapshot(brand: OrganizationDesignSystem): SerializedBrandSnapshot {
  const warnings: string[] = [];
  const rawColors = new Map<string, string>();
  for (const token of brand.palette) {
    if (!token || !COLOR_NAMES.has(token.name)) continue;
    const hex = normalizedHex(token.hex);
    if (hex && !rawColors.has(token.name)) rawColors.set(token.name, hex);
  }

  const background = rawColors.get('background') ?? '#FFFFFF';
  const surface = rawColors.get('surface') ?? background;
  const colors = [...rawColors.entries()].map(([role, hex]) => {
    const foregroundRole = ['ink', 'accent', 'muted', 'secondary'].includes(role);
    const corrected = foregroundRole
      ? readableForeground(hex, [background, surface], role, warnings)
      : hex;
    return `${role}=${corrected}`;
  });
  for (const token of brand.palette) {
    if (token && COLOR_NAMES.has(token.name) && !normalizedHex(token.hex)) {
      warnings.push(`Charte : couleur invalide ignorée pour ${token.name}.`);
    }
  }

  const display = mapFont(brand.typography?.display, 'display', warnings);
  const body = mapFont(brand.typography?.body, 'corps', warnings);
  const utility = mapFont(brand.typography?.utility, 'fonctionnelle', warnings);
  const fields = [
    `colors: ${colors.join(' ')}`,
    `fonts: display=${display}; body=${body}; utility=${utility}`,
    `avoid: ${(Array.isArray(brand.never) ? brand.never : [])
      .map((item) => cleanText(item, 100))
      .filter(Boolean)
      .join('; ')}`,
    `layout: ${cleanText(brand.layoutLogic)}`,
    `signature: ${cleanText(brand.signatureElement)}`,
    `shape: radius=${cleanText(brand.cornerRadius, 40)}; borders/shadows=${cleanText(brand.borderAndShadow)}`,
    `spacing: ${cleanText(brand.spacingRhythm, 120)}; density=${cleanText(brand.density, 80)}`,
  ];
  // Truncate lower-priority fields first, preserving avoid → colors → fonts.
  const priorities = [3, 4, 5, 6, 1, 0, 2];
  for (const index of priorities) {
    if (fields.join('\n').length <= MAX_BRAND_SNAPSHOT_LENGTH) break;
    const line = fields[index];
    const available = Math.max(
      0,
      MAX_BRAND_SNAPSHOT_LENGTH - (fields.join('\n').length - line.length),
    );
    fields[index] = line.slice(0, available);
  }
  const text = fields.filter(Boolean).join('\n').slice(0, MAX_BRAND_SNAPSHOT_LENGTH);
  return { text, warnings };
}

export function organizationDesignSystemFromSettings(
  settings: unknown,
): OrganizationDesignSystem | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const candidate = (settings as { brandDesignSystem?: unknown }).brandDesignSystem;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const value = candidate as Partial<OrganizationDesignSystem>;
  if (
    value.version !== 1 ||
    typeof value.sourceUrl !== 'string' ||
    !Array.isArray(value.palette) ||
    !value.typography ||
    typeof value.layoutLogic !== 'string'
  ) {
    return undefined;
  }
  return value as OrganizationDesignSystem;
}

export function buildOrganizationImagePrompt(
  contentPrompt: string,
  design?: OrganizationDesignSystem,
): string {
  const isInfographic = /infograph|diagram|chart|table|sch[eé]ma|graphique|tableau/i.test(
    contentPrompt,
  );
  const compositionRules = isInfographic
    ? 'Use an editorial infographic composition with one clear reading path, a strict hierarchy, short labels, aligned modules, generous internal spacing and no overlap.'
    : 'Use one clear focal point, strong hierarchy, balanced negative space and a composition readable at presentation size.';
  const safetyRules = `Keep every meaningful element inside a 10% safe margin. Never crop text, labels, faces or key objects. Never print color codes, prompt instructions or technical metadata inside the image. Never invent or redraw a logo. Do not add a watermark. ${compositionRules}`;
  if (!design) return `${contentPrompt}\n\nDESIGN QUALITY RULES\n${safetyRules}`;

  const palette = design.palette
    .map((token) => `${token.name}: ${token.hex} (${token.purpose})`)
    .join('; ');
  return `${contentPrompt}\n\nORGANIZATION DESIGN SYSTEM\nYou are the design lead for this visual. Fidelity to the organization design system takes priority over your own stylistic preferences. Apply the colors; never display their hex codes as text.\nPalette: ${palette}.\nTypography character: display ${design.typography.display}; body ${design.typography.body}; labels ${design.typography.utility}.\nSpacing and density: ${design.spacingRhythm}; ${design.density}.\nShapes: ${design.cornerRadius}. Borders and shadows: ${design.borderAndShadow}.\nLayout logic: ${design.layoutLogic}.\nSignature element: ${design.signatureElement}.\nThis design never does: ${design.never.join('; ')}.\n${safetyRules}`;
}
import tinycolor from 'tinycolor2';
import { DESIGN_FONTS } from '@openmaic/dsl';
