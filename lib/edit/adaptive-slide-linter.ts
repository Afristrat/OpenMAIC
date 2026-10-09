import tinycolor from 'tinycolor2';
import { DESIGN_FONTS, type PPTElement, type Slide, type Stage } from '@openmaic/dsl';
import { buildPalette, type DesignDirective } from '@/lib/branding/design-directive';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import { getElementListRange } from '@/lib/utils/element';

export type AdaptiveSlideRuleId =
  | 'R-PALETTE'
  | 'R-CONTRAST-TEXT'
  | 'R-CONTRAST-UI'
  | 'R-BG-GRADIENT'
  | 'R-BG-IMAGE'
  | 'R-MINSIZE'
  | 'R-SAFE-AREA'
  | 'R-OVERLAP'
  | 'R-CAPACITY'
  | 'R-MAXBLOCKS'
  | 'R-WORDS'
  | 'R-FONT'
  | 'R-READING-ORDER'
  | 'R-ONE-TITLE'
  | 'R-GRADIENT-ONLY-BG'
  | 'R-NO-MEANING-ANIM'
  | 'R-NAMES'
  | 'R-ALT'
  | 'R-CAPS';

export interface AdaptiveSlideLintIssue {
  ruleId: AdaptiveSlideRuleId;
  severity: 'error' | 'warning';
  elementId?: string;
  message: string;
  repaired?: boolean;
}

export interface AdaptiveSlideLintOptions {
  directive: DesignDirective;
  brandSnapshot?: Stage['brandSnapshot'];
  thresholds?: Partial<{
    textContrast: number;
    largeTextContrast: number;
    uiContrast: number;
    maxBlocks: number;
    maxWords: number;
  }>;
  loadedFonts?: readonly string[];
}

export interface AdaptiveSlideLintResult {
  slide: Slide;
  issues: AdaptiveSlideLintIssue[];
}

const SAFE_NAMES = new Set([
  'title',
  'subtitle',
  'body',
  'label',
  'footer',
  'card-bg',
  'card-accent',
  'decor',
  'media',
  'chart',
  'table',
  'code',
  'quote',
  'number-badge',
  'cta',
]);
const TEXT_TAG = /<(p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/giu;
const STYLE_ATTRIBUTE = /\bstyle\s*=\s*(["'])(.*?)\1/giu;
const CSS_DECLARATION = /([\w-]+)\s*:\s*([^;]+)/gu;
const MAX_AUTO_REPAIR_PASSES = 2;

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function textBlocks(element: PPTElement) {
  const content =
    element.type === 'text'
      ? element.content
      : element.type === 'shape'
        ? element.text?.content
        : undefined;
  if (!content) return [];
  return Array.from(content.matchAll(TEXT_TAG), (match) => ({
    text: plainText(match[3] ?? ''),
  })).filter((block) => block.text.length > 0);
}

function cssValues(html: string, property: string): string[] {
  const values: string[] = [];
  for (const styleMatch of html.matchAll(STYLE_ATTRIBUTE)) {
    for (const declaration of (styleMatch[2] ?? '').matchAll(CSS_DECLARATION)) {
      if (declaration[1]?.toLowerCase() === property)
        values.push((declaration[2] ?? '').trim().replace(/^['"]|['"]$/gu, ''));
    }
  }
  return values;
}

function normalizeColor(value: string): string | null {
  const color = tinycolor(value);
  if (!color.isValid() || color.getAlpha() < 1) return null;
  return color.toHexString().toUpperCase();
}

function luminance(color: string): number {
  const { r, g, b } = tinycolor(color).toRgb();
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function getWcagContrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function rgbToLab(hex: string): [number, number, number] {
  const { r, g, b } = tinycolor(hex).toRgb();
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const red = linear(r);
  const green = linear(g);
  const blue = linear(b);
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = (red * 0.2126729 + green * 0.7151522 + blue * 0.072175) / 1;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
  const pivot = (value: number) =>
    value > 0.008856451679 ? Math.cbrt(value) : 7.787037037 * value + 16 / 116;
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000, implemented locally to keep the audit deterministic and dependency-free. */
export function getCiede2000(firstHex: string, secondHex: string): number {
  const [l1, a1, b1] = rgbToLab(firstHex);
  const [l2, a2, b2] = rgbToLab(secondHex);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const meanC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const adjustedA1 = (1 + g) * a1;
  const adjustedA2 = (1 + g) * a2;
  const adjustedC1 = Math.hypot(adjustedA1, b1);
  const adjustedC2 = Math.hypot(adjustedA2, b2);
  const hue = (a: number, b: number) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const h1 = hue(adjustedA1, b1);
  const h2 = hue(adjustedA2, b2);
  const deltaL = l2 - l1;
  const deltaC = adjustedC2 - adjustedC1;
  let deltaHue = h2 - h1;
  if (adjustedC1 * adjustedC2 === 0) deltaHue = 0;
  else if (deltaHue > 180) deltaHue -= 360;
  else if (deltaHue < -180) deltaHue += 360;
  const deltaH = 2 * Math.sqrt(adjustedC1 * adjustedC2) * Math.sin((deltaHue * Math.PI) / 180 / 2);
  const meanL = (l1 + l2) / 2;
  const meanAdjustedC = (adjustedC1 + adjustedC2) / 2;
  let meanHue = h1 + h2;
  if (adjustedC1 * adjustedC2 === 0) meanHue = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) meanHue /= 2;
  else if (h1 + h2 < 360) meanHue = (h1 + h2 + 360) / 2;
  else meanHue = (h1 + h2 - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(((meanHue - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * meanHue * Math.PI) / 180) +
    0.32 * Math.cos(((3 * meanHue + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * meanHue - 63) * Math.PI) / 180);
  const deltaTheta = 30 * Math.exp(-(((meanHue - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(meanAdjustedC ** 7 / (meanAdjustedC ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (meanL - 50) ** 2) / Math.sqrt(20 + (meanL - 50) ** 2);
  const sc = 1 + 0.045 * meanAdjustedC;
  const sh = 1 + 0.015 * meanAdjustedC * t;
  const rt = -Math.sin((2 * deltaTheta * Math.PI) / 180) * rc;
  const l = deltaL / sl;
  const c = deltaC / sc;
  const h = deltaH / sh;
  return Math.sqrt(l * l + c * c + h * h + rt * c * h);
}

function paletteColors(directive: DesignDirective, snapshot: Stage['brandSnapshot']): string[] {
  const colors = Object.values(buildPalette(directive));
  if (snapshot?.version === 1) {
    const colorLine = snapshot.content.match(/(?:^|\n)colors:\s*([^\n]*)/u)?.[1] ?? '';
    for (const match of colorLine.matchAll(
      /\b(?:background|surface|ink|accent|muted|secondary)=(#[\da-fA-F]{6})\b/gu,
    )) {
      colors.push((match[1] ?? '').toUpperCase());
    }
  }
  return [
    ...new Set(colors.map(normalizeColor).filter((color): color is string => color !== null)),
  ];
}

function readElementColors(value: unknown, key = ''): string[] {
  if (typeof value === 'string') {
    return /(?:color|fill|backcolor)$/iu.test(key) && normalizeColor(value)
      ? [normalizeColor(value)!]
      : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry) => readElementColors(entry, key));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => readElementColors(child, childKey));
}

function elementFonts(element: PPTElement): string[] {
  const fonts = new Set<string>();
  if (element.type === 'text') fonts.add(element.defaultFontName);
  if (element.type === 'shape' && element.text) fonts.add(element.text.defaultFontName);
  const html =
    element.type === 'text'
      ? element.content
      : element.type === 'shape'
        ? (element.text?.content ?? '')
        : '';
  for (const font of cssValues(html, 'font-family'))
    fonts.add(
      font
        .split(',')[0]
        ?.trim()
        .replace(/^['"]|['"]$/gu, '') ?? '',
    );
  if (element.type === 'table') {
    for (const row of element.data)
      for (const cell of row) if (cell.style?.fontname) fonts.add(cell.style.fontname);
  }
  return [...fonts].filter(Boolean);
}

function replaceColorDeep<T>(value: T, target: string, replacement: string, key = ''): T {
  if (typeof value === 'string') {
    if (normalizeColor(value) === target) return replacement as T;
    if (key === 'content') {
      return value.replace(
        /((?:color|fill|background-color)\s*:\s*)(#[\da-f]{3}(?:[\da-f]{3})?)/giu,
        (match, prefix: string, color: string) =>
          normalizeColor(color) === target ? `${prefix}${replacement}` : match,
      ) as T;
    }
    return value as T;
  }
  if (Array.isArray(value))
    return value.map((entry) => replaceColorDeep(entry, target, replacement, key)) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, entry]) => [
      childKey,
      replaceColorDeep(entry, target, replacement, childKey),
    ]),
  ) as T;
}

function parseBackgrounds(slide: Slide): string[] {
  const background = slide.background;
  if (background?.type === 'solid' && background.color) return [background.color];
  if (background?.type === 'gradient' && background.gradient?.colors.length) {
    const stops = background.gradient.colors.map((stop) => stop.color);
    const samples = [...stops];
    for (let index = 0; index < stops.length - 1; index += 1) {
      samples.push(tinycolor.mix(stops[index]!, stops[index + 1]!, 50).toHexString());
    }
    return samples;
  }
  if (background?.type === 'image') return [];
  return [slide.theme.backgroundColor || '#FFFFFF'];
}

function opaqueBackingShapes(elements: PPTElement[]) {
  return elements.filter(
    (element): element is Extract<PPTElement, { type: 'shape' }> =>
      element.type === 'shape' &&
      normalizeColor(element.fill) !== null &&
      (element.opacity ?? 1) >= 0.85,
  );
}

function bestPaletteColor(color: string, palette: string[]) {
  return palette
    .map((candidate) => ({ color: candidate, distance: getCiede2000(color, candidate) }))
    .sort((a, b) => a.distance - b.distance)[0];
}

function repairTextContrast(
  element: PPTElement,
  targetColor: string,
  backgrounds: string[],
  target: number,
): PPTElement {
  if (element.type !== 'text' && !(element.type === 'shape' && element.text)) return element;
  const original = normalizeColor(targetColor);
  if (!original) return element;
  const averageBackgroundLuminance =
    backgrounds.reduce((sum, color) => sum + luminance(color), 0) / Math.max(1, backgrounds.length);
  const direction = averageBackgroundLuminance > 0.5 ? 'darken' : 'lighten';
  let candidate = tinycolor(original);
  for (let step = 0; step < MAX_AUTO_REPAIR_PASSES * 25; step += 1) {
    if (
      backgrounds.every(
        (background) => getWcagContrast(candidate.toHexString(), background) >= target,
      )
    ) {
      const repairedColor = candidate.toHexString().toUpperCase();
      if (element.type === 'text') {
        const content = element.content.replace(
          /(\bcolor\s*:\s*)(#[\da-f]{3}(?:[\da-f]{3})?)(?=\s*(?:;|"|'))/giu,
          (match, prefix: string, value: string) =>
            normalizeColor(value) === targetColor ? `${prefix}${repairedColor}` : match,
        );
        return {
          ...element,
          defaultColor:
            normalizeColor(element.defaultColor) === targetColor
              ? repairedColor
              : element.defaultColor,
          content,
        };
      }
      return {
        ...element,
        text: {
          ...element.text!,
          defaultColor:
            normalizeColor(element.text!.defaultColor) === targetColor
              ? repairedColor
              : element.text!.defaultColor,
          content: element.text!.content.replace(
            /(\bcolor\s*:\s*)(#[\da-f]{3}(?:[\da-f]{3})?)(?=\s*(?:;|"|'))/giu,
            (match, prefix: string, value: string) =>
              normalizeColor(value) === targetColor ? `${prefix}${repairedColor}` : match,
          ),
        },
      };
    }
    candidate = direction === 'darken' ? candidate.darken(3) : candidate.lighten(3);
  }
  return element;
}

function readFontSize(html: string): number[] {
  return cssValues(html, 'font-size')
    .map((value) => Number.parseFloat(value))
    .filter(Number.isFinite);
}

function estimateTextLines(text: string, width: number, fontSize: number): number {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0 || width <= 0 || fontSize <= 0) return 0;
  const averageGlyphWidth = 0.55 * fontSize;
  let lines = 1;
  let lineWidth = 0;
  for (const word of words) {
    const wordWidth = [...word].length * averageGlyphWidth;
    if (lineWidth > 0 && lineWidth + averageGlyphWidth + wordWidth > width) {
      lines += 1;
      lineWidth = wordWidth;
    } else lineWidth += (lineWidth > 0 ? averageGlyphWidth : 0) + wordWidth;
  }
  return lines;
}

function estimatedTextHeight(blocks: ReturnType<typeof textBlocks>, width: number, fontSize: number, lineHeight: number): number {
  const lines = blocks.reduce((sum, block) => sum + estimateTextLines(block.text, width, fontSize), 0);
  return lines * lineHeight * fontSize * 1.15;
}

function resizeTextBoxSafely(slide: Slide, index: number, element: Extract<PPTElement, { type: 'text' }>, height: number, safeBottom: number) {
  if (element.top + height > safeBottom) return null;
  const resized = { ...element, height };
  const candidateSlide = {
    ...slide,
    elements: slide.elements.map((candidate, candidateIndex) => candidateIndex === index ? resized : candidate),
  };
  const createsOverlap = auditSlideLayout(candidateSlide).some(
    (issue) => issue.type === 'overlap' && issue.elementIds.includes(element.id),
  );
  return createsOverlap ? null : resized;
}

export function lintAndRepairAdaptiveSlide(
  slide: Slide,
  options: AdaptiveSlideLintOptions,
): AdaptiveSlideLintResult {
  const thresholds = {
    textContrast: 4.5,
    largeTextContrast: 3,
    uiContrast: 3,
    maxBlocks: 6,
    maxWords: 50,
    ...options.thresholds,
  };
  const palette = paletteColors(options.directive, options.brandSnapshot);
  const repairedSlide = structuredClone(slide);
  const issues: AdaptiveSlideLintIssue[] = [];
  const backgrounds = parseBackgrounds(repairedSlide);
  const usableFonts = new Set(
    (options.loadedFonts?.length ? options.loadedFonts : DESIGN_FONTS).map((font) =>
      font.toLowerCase(),
    ),
  );
  const slideFonts = new Set<string>();

  for (let index = 0; index < repairedSlide.elements.length; index += 1) {
    let element = repairedSlide.elements[index]!;
    const html =
      element.type === 'text'
        ? element.content
        : element.type === 'shape'
          ? (element.text?.content ?? '')
          : '';
    const colors = [
      ...readElementColors(element),
      ...cssValues(html, 'color')
        .map(normalizeColor)
        .filter((color): color is string => color !== null),
    ];
    for (const color of new Set(colors)) {
      const closest = bestPaletteColor(color, palette);
      if (closest && closest.distance <= 3 && closest.color !== color) {
        element = replaceColorDeep(element, color, closest.color);
        issues.push({
          ruleId: 'R-PALETTE',
          severity: 'warning',
          elementId: element.id,
          message: `Couleur ${color} rapprochée de ${closest.color} (ΔE ${closest.distance.toFixed(2)}).`,
          repaired: true,
        });
      } else if (!closest || closest.distance > 3) {
        issues.push({
          ruleId: 'R-PALETTE',
          severity: 'error',
          elementId: element.id,
          message: `Couleur ${color} hors de la palette (ΔE minimal ${closest?.distance.toFixed(2) ?? 'indisponible'}).`,
        });
      }
    }

    const blocks = textBlocks(element);
    const textSizes = readFontSize(html);
    const minSize =
      element.name === 'label' ||
      (element.type === 'text' && ['partNumber', 'itemNumber'].includes(element.textType ?? ''))
        ? 12
        : 16;
    for (const size of textSizes) {
      if (size < minSize)
        issues.push({
          ruleId: 'R-MINSIZE',
          severity: 'error',
          elementId: element.id,
          message: `Taille de texte ${size} inférieure au plancher ${minSize}.`,
        });
    }
    for (const font of elementFonts(element)) {
      slideFonts.add(font.toLowerCase());
      if (!usableFonts.has(font.toLowerCase()))
        issues.push({
          ruleId: 'R-FONT',
          severity: 'error',
          elementId: element.id,
          message: `Police non autorisée ou non chargée : ${font}.`,
        });
    }

    const readingColors =
      element.type === 'text'
        ? [element.defaultColor, ...cssValues(element.content, 'color')]
        : element.type === 'shape' && element.text
          ? [element.text.defaultColor, ...cssValues(element.text.content, 'color')]
          : [];
    const averageSize = textSizes.length
      ? textSizes.reduce((sum, size) => sum + size, 0) / textSizes.length
      : 18;
    const requiredContrast =
      averageSize >= 24 ? thresholds.largeTextContrast : thresholds.textContrast;
    const foreground = readingColors
      .map(normalizeColor)
      .filter((color): color is string => color !== null);
    const elementRange = getElementListRange([element]);
    if (repairedSlide.background?.type === 'image' && foreground.length) {
      const hasOpaqueBacking = opaqueBackingShapes(repairedSlide.elements).some(
        (candidate) =>
          candidate.left <= elementRange.minX &&
          candidate.top <= elementRange.minY &&
          candidate.left + candidate.width >= elementRange.maxX &&
          candidate.top + candidate.height >= elementRange.maxY,
      );
      if (!hasOpaqueBacking)
        issues.push({
          ruleId: 'R-BG-IMAGE',
          severity: 'error',
          elementId: element.id,
          message: 'Texte sur fond image sans forme de support opaque couvrant le texte.',
        });
    }
    for (const color of foreground) {
      const effectiveBackgrounds =
        element.type === 'text' && element.fill && normalizeColor(element.fill)
          ? [normalizeColor(element.fill)!]
          : element.type === 'shape' && element.text && normalizeColor(element.fill)
            ? [normalizeColor(element.fill)!]
            : repairedSlide.background?.type === 'image'
              ? opaqueBackingShapes(repairedSlide.elements)
                  .filter(
                    (candidate) =>
                      candidate.left <= elementRange.minX &&
                      candidate.top <= elementRange.minY &&
                      candidate.left + candidate.width >= elementRange.maxX &&
                      candidate.top + candidate.height >= elementRange.maxY,
                  )
                  .map((candidate) => normalizeColor(candidate.fill)!)
              : backgrounds;
      if (
        effectiveBackgrounds.length &&
        effectiveBackgrounds.some(
          (background) => getWcagContrast(color, background) < requiredContrast,
        )
      ) {
        const fixed = repairTextContrast(element, color, effectiveBackgrounds, requiredContrast);
        const fixedColor =
          fixed.type === 'text'
            ? normalizeColor(fixed.defaultColor)
            : fixed.type === 'shape' && fixed.text
              ? normalizeColor(fixed.text.defaultColor)
              : null;
        if (
          fixed !== element &&
          fixedColor &&
          effectiveBackgrounds.every(
            (background) => getWcagContrast(fixedColor, background) >= requiredContrast,
          )
        ) {
          element = fixed;
          issues.push({
            ruleId: 'R-CONTRAST-TEXT',
            severity: 'warning',
            elementId: element.id,
            message: `Couleur de texte ajustée pour atteindre ${requiredContrast}:1.`,
            repaired: true,
          });
        } else {
          issues.push({
            ruleId:
              repairedSlide.background?.type === 'gradient' ? 'R-BG-GRADIENT' : 'R-CONTRAST-TEXT',
            severity: 'error',
            elementId: element.id,
            message: `Contraste inférieur à ${requiredContrast}:1 sur au moins un fond échantillonné.`,
          });
        }
      }
    }

    if (blocks.length > 0) {
      if (element.type === 'text') {
        const size = textSizes[0] ?? 18;
        const lineHeight = element.lineHeight ?? 1.2;
        const requiredHeight = estimatedTextHeight(blocks, element.width, size, lineHeight);
        if (requiredHeight > element.height) {
          const safeBottom = repairedSlide.viewportSize * repairedSlide.viewportRatio - 32;
          const resized = resizeTextBoxSafely(repairedSlide, index, element, requiredHeight, safeBottom);
          if (resized) {
            element = resized;
            issues.push({
              ruleId: 'R-CAPACITY', severity: 'warning', elementId: element.id,
              message: `Boîte agrandie sans débordement à ${Math.ceil(requiredHeight)} unités.`, repaired: true,
            });
          } else {
            const sizesAboveFloor = textSizes.length > 0 && textSizes.every((value) => value - 2 >= minSize);
            const smallerSize = size - 2;
            const smallerHeight = estimatedTextHeight(blocks, element.width, smallerSize, lineHeight);
            if (sizesAboveFloor && smallerHeight <= element.height) {
              const content = element.content.replace(/(font-size\s*:\s*)(\d+(?:\.\d+)?)(px)/giu, (_match, prefix: string, value: string, unit: string) => `${prefix}${Math.max(minSize, Number(value) - 2)}${unit}`);
              element = { ...element, content };
              issues.push({ ruleId: 'R-CAPACITY', severity: 'warning', elementId: element.id, message: `Corps réduit d’un cran pour tenir dans la boîte.`, repaired: true });
            } else {
              issues.push({
                ruleId: 'R-CAPACITY', severity: 'error', elementId: element.id,
                message: `Capacité estimée insuffisante : ${Math.ceil(requiredHeight)} unités requises, hauteur ${element.height}.`,
              });
            }
          }
        }
      }
    }

    const isDecor = element.name === 'decor' || element.name === 'card-bg';
    if (!isDecor) {
      const range = getElementListRange([element]);
      const width = repairedSlide.viewportSize;
      const height = width * repairedSlide.viewportRatio;
      const margin = options.directive.grid.margin;
      if (
        range.minX < margin ||
        range.maxX > width - margin ||
        range.minY < 48 ||
        range.maxY > height - 32
      ) {
        issues.push({
          ruleId: 'R-SAFE-AREA',
          severity: 'error',
          elementId: element.id,
          message: `Élément hors zone de sécurité (marge ${margin}).`,
        });
      }
    }

    if (element.type === 'shape' && element.gradient)
      issues.push({
        ruleId: 'R-GRADIENT-ONLY-BG',
        severity: 'error',
        elementId: element.id,
        message: 'Les dégradés sont réservés au fond de la slide.',
      });
    if (element.name && !SAFE_NAMES.has(element.name))
      issues.push({
        ruleId: 'R-NAMES',
        severity: 'warning',
        elementId: element.id,
        message: `Nom d’élément hors vocabulaire fermé : ${element.name}.`,
      });
    if (element.type === 'shape' && element.text) {
      const fontColor = normalizeColor(element.text.defaultColor);
      if (
        fontColor &&
        element.fill &&
        normalizeColor(element.fill) &&
        getWcagContrast(fontColor, normalizeColor(element.fill)!) < thresholds.uiContrast
      ) {
        issues.push({
          ruleId: 'R-CONTRAST-UI',
          severity: 'warning',
          elementId: element.id,
          message: 'Contraste du texte de forme inférieur à 3:1.',
        });
      }
    }
    const imageAlt =
      element.type === 'image'
        ? (element as PPTElement & { alt?: unknown; altText?: unknown })
        : null;
    if (
      imageAlt &&
      ('alt' in imageAlt || 'altText' in imageAlt) &&
      !String(imageAlt.altText ?? imageAlt.alt ?? '').trim()
    ) {
      issues.push({
        ruleId: 'R-ALT',
        severity: 'warning',
        elementId: element.id,
        message: 'Texte alternatif vide sur une image.',
      });
    }
    repairedSlide.elements[index] = element;
  }

  const titleCount = repairedSlide.elements.filter(
    (element) =>
      element.type === 'text' && (element.textType === 'title' || element.name === 'title'),
  ).length;
  if (titleCount > 1 && repairedSlide.type !== 'cover' && repairedSlide.type !== 'end')
    issues.push({
      ruleId: 'R-ONE-TITLE',
      severity: 'warning',
      message: `${titleCount} éléments sont marqués comme titre.`,
    });
  if (slideFonts.size > 2) {
    issues.push({ ruleId: 'R-FONT', severity: 'error', message: `${slideFonts.size} familles de police détectées sur une slide ; seuil maximal 2.` });
  }
  const textPositions = repairedSlide.elements
    .map((element, index) => ({ element, index }))
    .filter(
      ({ element }) =>
        element.type === 'text' && element.name !== 'footer' && element.textType !== 'footer',
    )
    .map(({ element, index }) => ({ index, top: element.top, left: element.left }));
  const orderedTextPositions = [...textPositions].sort((a, b) => a.top - b.top || a.left - b.left);
  if (
    orderedTextPositions.some((position, index) => position.index !== textPositions[index]?.index)
  ) {
    issues.push({
      ruleId: 'R-READING-ORDER',
      severity: 'warning',
      message:
        'L’ordre des éléments texte ne suit pas l’ordre visuel haut-bas, puis gauche-droite.',
    });
  }
  const contentElements = repairedSlide.elements.filter(
    (element) => !['decor', 'card-bg', 'footer'].includes(element.name ?? ''),
  );
  const blocks = contentElements.length;
  if (blocks > thresholds.maxBlocks)
    issues.push({
      ruleId: 'R-MAXBLOCKS',
      severity: 'warning',
      message: `${blocks} éléments de contenu (seuil ${thresholds.maxBlocks}).`,
    });
  const wordLimit =
    repairedSlide.type === 'cover' ||
    repairedSlide.type === 'end' ||
    repairedSlide.type === 'transition'
      ? 20
      : thresholds.maxWords;
  const visibleWords = repairedSlide.elements
    .filter(
      (element) =>
        element.type !== 'text' ||
        (element.textType !== 'title' &&
          element.name !== 'title' &&
          element.textType !== 'footer' &&
          element.name !== 'footer'),
    )
    .flatMap((element) => textBlocks(element).map((block) => block.text))
    .join(' ')
    .split(/\s+/u)
    .filter(Boolean).length;
  if (visibleWords > wordLimit)
    issues.push({
      ruleId: 'R-WORDS',
      severity: 'warning',
      message: `${visibleWords} mots visibles hors titres (seuil ${wordLimit}).`,
    });
  if (repairedSlide.animations?.length)
    issues.push({
      ruleId: 'R-NO-MEANING-ANIM',
      severity: 'warning',
      message:
        'La compréhension doit rester complète sans animation ; contrôle sémantique non automatisable.',
    });
  const layoutIssues = auditSlideLayout(repairedSlide);
  for (const issue of layoutIssues)
    issues.push({
      ruleId: 'R-OVERLAP',
      severity: 'error',
      ...(issue.type === 'overlap'
        ? { elementId: issue.elementIds.join(',') }
        : { elementId: issue.elementId }),
      message:
        issue.type === 'overlap'
          ? `Chevauchement entre ${issue.elementIds.join(' et ')}.`
          : 'Élément hors canevas.',
    });
  if (
    repairedSlide.elements.some(
      (element) =>
        (element.type === 'text' && /text-transform\s*:/iu.test(element.content)) ||
        (element.type === 'shape' && /text-transform\s*:/iu.test(element.text?.content ?? '')),
    )
  )
    issues.push({
      ruleId: 'R-CAPS',
      severity: 'warning',
      message: 'text-transform est interdit ; écrire les capitales dans le contenu.',
    });
  if (repairedSlide.background?.type === 'gradient') {
    const gradientSamples = parseBackgrounds(repairedSlide);
    if (gradientSamples.length < 2)
      issues.push({
        ruleId: 'R-BG-GRADIENT',
        severity: 'error',
        message: 'Dégradé sans au moins deux échantillons de couleur.',
      });
  }
  return { slide: repairedSlide, issues };
}
