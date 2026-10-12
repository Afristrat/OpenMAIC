import tinycolor from 'tinycolor2';
import type { BrandColorToken } from './organization-design-system';

/** Everything read from a tenant website: its HTML, its own stylesheets, a rendered screenshot. */
export interface BrandSources {
  html: string;
  /** Text of the site's own stylesheets (framework and vendor sheets are excluded upstream). */
  css: string[];
  /** Dominant colours of the rendered page, most frequent first; used only for the background. */
  screenshotColors: string[];
}

export interface ExtractedBrand {
  palette: BrandColorToken[];
  fonts: { display?: string; body?: string; utility?: string };
  inferred: string[];
}

const COLOR_VALUE = /^(?:#[\da-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/iu;
const FONT_DEFAULTS = new Set(['inherit', 'initial', 'unset', 'revert']);
const ICON_FONT = /icon|awesome|dashicons|glyph|symbol|material/iu;
const MONO_FONT = /mono|consol|courier|menlo|monaco/iu;
const STYLE_BLOCK_MAX_CHARS = 1_500_000;
/** Default palettes of WordPress, Bootstrap and Tailwind: framework colours, not the tenant's. */
const FRAMEWORK_VARIABLE = /^--(?:wp--|bs-|tw-)/iu;
const FRAMEWORK_DECLARATION = /--(?:wp--|bs-|tw-)[\w-]*\s*:[^;}]*;?/giu;
/** Name hints, strongest first: a variable named like this carries the brand colour. */
const ACCENT_NAME_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/primary|brand|accent/iu, 3],
  [/signal|action|cta|theme|main/iu, 2],
];
const NOT_A_BRAND_COLOUR_NAME = /dark|text|on-|overlay|border|line|shadow|muted|subtle|bg|back/iu;

function normalizedHex(value: string): string | undefined {
  const color = tinycolor(value.trim());
  return color.isValid() && color.getAlpha() === 1 ? `#${color.toHex().toUpperCase()}` : undefined;
}

function isChromatic(hex: string): boolean {
  const { s, l } = tinycolor(hex).toHsl();
  return s >= 0.28 && l >= 0.12 && l <= 0.88;
}

function hueDistance(left: string, right: string): number {
  const gap = Math.abs(tinycolor(left).toHsl().h - tinycolor(right).toHsl().h);
  return Math.min(gap, 360 - gap);
}

/** Style text only: scripts and markup carry no design decision and are costly to scan. */
function styleBlocks(html: string): string[] {
  return [...html.matchAll(/<style\b[^>]*>([^<]*)<\/style>/giu)].map((match) =>
    match[1].slice(0, STYLE_BLOCK_MAX_CHARS),
  );
}

/** `--name: value` declarations, aliases (`var(--other)`) resolved; the first definition wins. */
function customProperties(css: string): Map<string, string> {
  const raw = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/gu)) {
    if (!raw.has(match[1])) raw.set(match[1], match[2]);
  }
  const resolve = (value: string, depth = 0): string => {
    const alias = value.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/u);
    if (!alias || depth > 5) return value;
    const target = raw.get(alias[1]);
    return target === undefined ? value : resolve(target, depth + 1);
  };
  return new Map([...raw].map(([name, value]) => [name, resolve(value)]));
}

function colorVariables(properties: Map<string, string>): Map<string, string> {
  const colors = new Map<string, string>();
  for (const [name, value] of properties) {
    if (FRAMEWORK_VARIABLE.test(name) || !COLOR_VALUE.test(value)) continue;
    const hex = normalizedHex(value);
    if (hex) colors.set(name, hex);
  }
  return colors;
}

/** Uses of each colour, counted in one pass: as a literal, or through a variable resolving to it. */
function colorUsage(css: string, variables: Map<string, string>): Map<string, number> {
  const usage = new Map<string, number>();
  const add = (hex: string) => usage.set(hex, (usage.get(hex) ?? 0) + 1);
  for (const match of css.matchAll(/#[\da-f]{6}\b/giu)) {
    const hex = normalizedHex(match[0]);
    if (hex) add(hex);
  }
  for (const match of css.matchAll(/var\(\s*(--[\w-]+)/gu)) {
    const hex = variables.get(match[1]);
    if (hex) add(hex);
  }
  return usage;
}

function nameWeight(names: string[]): number {
  let weight = 0;
  for (const name of names) {
    if (NOT_A_BRAND_COLOUR_NAME.test(name)) continue;
    for (const [pattern, value] of ACCENT_NAME_WEIGHTS) {
      if (pattern.test(name)) weight = Math.max(weight, value);
    }
  }
  return weight;
}

function themeColor(html: string): string | undefined {
  const tag = html.match(/<meta\b[^>]*name=["']theme-color["'][^>]*>/iu)?.[0];
  const value = tag?.match(/content=["']([^"']+)["']/iu)?.[1];
  return value ? normalizedHex(value) : undefined;
}

function roleVariable(
  variables: Map<string, string>,
  include: RegExp,
  exclude: RegExp,
): string | undefined {
  for (const [name, hex] of variables) {
    if (include.test(name) && !exclude.test(name)) return hex;
  }
  return undefined;
}

/** Declared `property: colour` values inside the rules whose selector matches. */
function ruleColor(css: string, selector: RegExp, property: RegExp): string | undefined {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    if (!selector.test(rule[1])) continue;
    const declaration = rule[2].match(
      new RegExp(`(?:^|;)\\s*${property.source}\\s*:\\s*([^;]+)`, 'iu'),
    )?.[1];
    const hex = declaration ? normalizedHex(declaration) : undefined;
    if (hex) return hex;
  }
  return undefined;
}

function declaredTextColors(css: string): string[] {
  const colors: string[] = [];
  for (const match of css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/giu)) {
    const hex = normalizedHex(match[1]);
    if (hex) colors.push(hex);
  }
  return colors;
}

function mostFrequent(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function pickColors(
  css: string,
  html: string,
  screenshotColors: string[],
  variables: Map<string, string>,
) {
  const inferred: string[] = [];
  const bodySelector = /(?:^|[\s,])(?:html|body|:root)\s*$/iu;

  const background =
    roleVariable(
      variables,
      /^--(?:color-)?(?:paper|background|bg|page|canvas)(?:-|$)/iu,
      /overlay|dark|on-/iu,
    ) ??
    ruleColor(css, bodySelector, /background(?:-color)?/u) ??
    screenshotColors.map(normalizedHex).find((color): color is string => Boolean(color));
  if (!background) inferred.push('Fond non détecté : blanc retenu');

  const surface = roleVariable(variables, /^--(?:color-)?surface(?:-|$)/iu, /dark|on-|overlay/iu);
  const muted = roleVariable(variables, /^--(?:color-)?muted(?:-|$)/iu, /dark|on-|overlay|text/iu);
  const ink =
    roleVariable(
      variables,
      /^--(?:color-)?(?:ink|text|foreground|fg)(?:-|$)/iu,
      /dark|on-|muted|subtle/iu,
    ) ??
    ruleColor(css, bodySelector, /color/u) ??
    mostFrequent(declaredTextColors(css).filter((color) => tinycolor(color).getLuminance() < 0.2));
  if (!ink) inferred.push('Encre non détectée : le texte dérive de la teinte du cours');

  const namesByColor = new Map<string, string[]>();
  const declarationOrder = new Map<string, number>();
  for (const [name, hex] of variables) {
    namesByColor.set(hex, [...(namesByColor.get(hex) ?? []), name]);
    if (!declarationOrder.has(hex)) declarationOrder.set(hex, declarationOrder.size);
  }
  const usage = colorUsage(css, variables);
  const theme = themeColor(html);
  // The name of a design token says the most (primary, brand, accent...); among equally named
  // tokens the primary colour is conventionally declared first; usage decides the rest.
  const candidates = [
    ...new Set([...namesByColor.keys(), ...usage.keys(), ...(theme ? [theme] : [])]),
  ]
    .filter(isChromatic)
    .map((hex) => ({
      hex,
      weight: nameWeight(namesByColor.get(hex) ?? []) + (hex === theme ? 1 : 0),
      order: declarationOrder.get(hex),
      uses: usage.get(hex) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        (left.weight > 0 && left.order !== undefined && right.order !== undefined
          ? left.order - right.order
          : 0) ||
        right.uses - left.uses,
    );
  const accent = candidates[0]?.hex;
  if (!accent) inferred.push('Accent non détecté : la palette dérive de la teinte du cours');
  const secondary = candidates.find(
    (candidate) => accent !== undefined && hueDistance(candidate.hex, accent) >= 30,
  )?.hex;

  return { background, surface, ink, accent, muted, secondary, inferred };
}

/** A font stack only: never a colour, a length or a computed value. */
function isFontValue(value: string): boolean {
  return !COLOR_VALUE.test(value) && !/color-mix|^calc|^\d/iu.test(value) && /[a-z]/iu.test(value);
}

function fontStack(value: string, properties: Map<string, string>): string | undefined {
  const alias = value.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/u);
  const resolved = alias ? properties.get(alias[1]) : value;
  if (resolved === undefined || !isFontValue(resolved)) return undefined;
  const families = resolved
    .replace(/["']/gu, '')
    .split(',')
    .map((family) => family.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const first = families[0] ?? '';
  if (!first || FONT_DEFAULTS.has(first.toLowerCase()) || ICON_FONT.test(first)) return undefined;
  return families.join(', ');
}

function googleFontFamilies(html: string): string[] {
  const families: string[] = [];
  for (const link of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s]+)/giu)) {
    for (const family of link[1].replace(/&amp;/gu, '&').matchAll(/family=([^&:;@]+)/gu)) {
      families.push(decodeURIComponent(family[1]).replace(/\+/gu, ' ').trim());
    }
  }
  return families;
}

function pickFonts(css: string, html: string, properties: Map<string, string>) {
  const headings: string[] = [];
  const bodies: string[] = [];
  const monos: string[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const declaration = rule[2].match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/iu)?.[1];
    const stack = declaration ? fontStack(declaration.trim(), properties) : undefined;
    if (!stack) continue;
    if (MONO_FONT.test(stack)) monos.push(stack);
    else if (/(?:^|[\s,>])h[1-6]\b|heading|title|headline|display/iu.test(rule[1]))
      headings.push(stack);
    else if (/(?:^|[\s,])(?:html|body|p|:root)\s*(?:$|[,{:])/iu.test(rule[1])) bodies.push(stack);
  }
  const named = (pattern: RegExp) => {
    for (const [name, value] of properties) {
      if (!pattern.test(name)) continue;
      const stack = fontStack(value, properties);
      if (stack) return stack;
    }
    return undefined;
  };
  const google = googleFontFamilies(html);
  const display =
    named(/^--(?:font-)?(?:display|heading|title|headline)$/iu) ??
    mostFrequent(headings) ??
    google[0];
  const body =
    named(/^--(?:font-)?(?:body|text|sans|base)$/iu) ??
    mostFrequent(bodies) ??
    google[0] ??
    display;
  const utility = named(/^--(?:font-)?(?:utility|mono|code)$/iu) ?? mostFrequent(monos) ?? body;
  return { display, body, utility };
}

/** Reads the colours and fonts a tenant website really declares: nothing is invented. */
export function extractBrandFromSources(sources: BrandSources): ExtractedBrand {
  // The framework declarations leave the text: their colours must not count as used either.
  const css = [...sources.css, ...styleBlocks(sources.html)]
    .join('\n')
    .replace(FRAMEWORK_DECLARATION, '');
  const properties = customProperties(css);
  const variables = colorVariables(properties);
  const colors = pickColors(css, sources.html, sources.screenshotColors, variables);
  const fonts = pickFonts(css, sources.html, properties);
  const inferred = [...colors.inferred];
  if (!fonts.display) inferred.push('Typographie non détectée : police du cours conservée');

  const purposes: Array<[BrandColorToken['name'], string | undefined, string]> = [
    ['background', colors.background ?? '#FFFFFF', 'page background and breathing room'],
    ['surface', colors.surface, 'cards and content surfaces'],
    ['ink', colors.ink, 'high-contrast text and structure'],
    ['accent', colors.accent, 'primary emphasis and calls to action'],
    ['muted', colors.muted, 'secondary information'],
    ['secondary', colors.secondary, 'supporting emphasis'],
  ];
  return {
    palette: purposes
      .filter((entry): entry is [BrandColorToken['name'], string, string] => Boolean(entry[1]))
      .map(([name, hex, purpose]) => ({ name, hex, purpose })),
    fonts,
    inferred,
  };
}
