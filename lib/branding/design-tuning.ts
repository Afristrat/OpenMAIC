/**
 * Visual tuning a tenant can set without touching the charter: how strong the pastel wash is,
 * how translucent the cards are, how much a spotlight dims the slide. Stored in the organization
 * settings, frozen into the course brand snapshot so a later change never alters a course.
 */

export interface DesignTuning {
  /** Share of the accent colour kept in the pastel surfaces (0.10 to 0.45). */
  tintStrength: number;
  /** Opacity of the white cards laid on a light surface (0.50 to 1). */
  cardOpacity: number;
  /** Dimming of the slide outside a spotlighted element (0.05 to 0.60). */
  spotlightDimness: number;
}

export const DEFAULT_DESIGN_TUNING: DesignTuning = {
  tintStrength: 0.27,
  cardOpacity: 0.72,
  spotlightDimness: 0.2,
};

const LIMITS: Record<keyof DesignTuning, readonly [number, number]> = {
  tintStrength: [0.1, 0.45],
  cardOpacity: [0.5, 1],
  spotlightDimness: [0.05, 0.6],
};

export const DESIGN_TUNING_LIMITS = LIMITS;

function clamp(key: keyof DesignTuning, value: unknown): number {
  const [min, max] = LIMITS[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 100) / 100))
    : DEFAULT_DESIGN_TUNING[key];
}

/** Bounded tuning from any stored value; anything missing or invalid falls back to the default. */
export function normalizeDesignTuning(value: unknown): DesignTuning {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    tintStrength: clamp('tintStrength', source.tintStrength),
    cardOpacity: clamp('cardOpacity', source.cardOpacity),
    spotlightDimness: clamp('spotlightDimness', source.spotlightDimness),
  };
}

export function designTuningFromSettings(settings: unknown): DesignTuning {
  const candidate =
    settings && typeof settings === 'object'
      ? (settings as { designTuning?: unknown }).designTuning
      : undefined;
  return normalizeDesignTuning(candidate);
}

/** One snapshot line, e.g. `tuning: tint=0.27 cards=0.72 dim=0.2`. */
export function serializeDesignTuning(tuning: DesignTuning): string {
  return `tuning: tint=${tuning.tintStrength} cards=${tuning.cardOpacity} dim=${tuning.spotlightDimness}`;
}

/** Reads the tuning line of a brand snapshot; absent or malformed values keep the defaults. */
export function parseDesignTuning(snapshotContent: string | undefined): DesignTuning {
  const line = snapshotContent?.match(/(?:^|\n)tuning:\s*([^\n]*)/u)?.[1] ?? '';
  const read = (pattern: RegExp) => {
    const match = line.match(pattern);
    return match ? Number(match[1]) : undefined;
  };
  return normalizeDesignTuning({
    tintStrength: read(/\btint=(\d*\.?\d+)/u),
    cardOpacity: read(/\bcards=(\d*\.?\d+)/u),
    spotlightDimness: read(/\bdim=(\d*\.?\d+)/u),
  });
}
