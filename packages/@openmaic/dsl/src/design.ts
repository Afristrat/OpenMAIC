/** Course-level visual direction, selected once with the outline plan. */
export const DESIGN_TONES = ['sober', 'warm', 'energetic', 'technical', 'editorial'] as const;
export const DESIGN_DENSITIES = ['compact', 'balanced', 'airy'] as const;
export const DESIGN_HUE_FAMILIES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'magenta',
  'neutral',
] as const;
export const DESIGN_FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Source Sans 3',
  'Merriweather',
  'Literata',
  'Source Serif 4',
  'JetBrains Mono',
] as const;

export interface DesignDirective {
  version: 1;
  source: 'charter' | 'derived';
  tone: (typeof DESIGN_TONES)[number];
  density: (typeof DESIGN_DENSITIES)[number];
  seed: {
    hueFamily: (typeof DESIGN_HUE_FAMILIES)[number];
    chromaLevel: 'low' | 'mid';
  };
  /** Hex colors are always derived in code, never authored by the planning model. */
  palette: null;
  typography: {
    heading: (typeof DESIGN_FONTS)[number];
    body: (typeof DESIGN_FONTS)[number];
    scaleShift: -1 | 0 | 1;
  };
  grid: { margin: number };
  shapes: { radius: number; stroke: 'none' | 'hairline' };
  surfacePlan: {
    content: 'base' | 'tint';
    engagement: 'dark' | 'tint';
    punchline: 'gradient' | 'solid' | 'none';
  };
  accentSequence: 'primary-then-achievement' | 'primary-only';
  forbidden: string[];
  notes: string;
}
