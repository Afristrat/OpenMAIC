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
