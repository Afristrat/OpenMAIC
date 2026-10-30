import type { PresentationBranding } from '@/lib/branding/presentation-branding';
import { escapeXml, wrapText } from './scene-card';

export type BillboardKind = 'entry' | 'exit';
export type BillboardLanguage = 'fr' | 'ar' | 'en';

/** Durée à l'écran : un carton d'entrée bref, un carton de sortie qui laisse le temps de lire. */
export const BILLBOARD_SECONDS: Record<BillboardKind, number> = { entry: 3, exit: 4 };

export interface BillboardPalette {
  background: string;
  ink: string;
  accent: string;
}

export const DEFAULT_BILLBOARD_PALETTE: BillboardPalette = {
  background: '#0f172a',
  ink: '#ffffff',
  accent: '#8b5cf6',
};

/** Ce que la marque de présentation de l'organisation autorise à montrer sur les cartons. */
export interface BillboardPlan {
  showOrganization: boolean;
  showQalem: boolean;
}

export function planBillboards(branding: PresentationBranding): BillboardPlan | null {
  if (branding.mode === 'none') return null;
  return {
    showOrganization: branding.mode === 'organization' || branding.mode === 'both',
    showQalem: branding.mode === 'qalem' || branding.mode === 'both',
  };
}

export function billboardLanguage(locale: string | null | undefined): BillboardLanguage {
  const value = (locale ?? '').toLowerCase();
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('en')) return 'en';
  return 'fr';
}

const TEXTS: Record<BillboardLanguage, { entry: string; exitTitle: string; credit: string }> = {
  fr: { entry: 'Formation', exitTitle: 'Merci de votre attention', credit: 'Réalisé avec Qalem' },
  ar: { entry: 'تكوين', exitTitle: 'شكراً لانتباهكم', credit: 'أُنجز بواسطة قلم' },
  en: { entry: 'Course', exitTitle: 'Thank you', credit: 'Made with Qalem' },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function expandHex(value: string): string {
  return value.length === 4
    ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    : value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Palette de l'organisation : fond et accent de sa charte quand ils sont des couleurs lisibles, sinon
 * ceux de la plateforme. L'encre est toujours déduite du fond : jamais de texte illisible.
 */
export function billboardPalette(colors: {
  background?: string;
  accent?: string;
}): BillboardPalette {
  const background =
    colors.background && HEX.test(colors.background)
      ? expandHex(colors.background)
      : DEFAULT_BILLBOARD_PALETTE.background;
  const accent =
    colors.accent && HEX.test(colors.accent)
      ? expandHex(colors.accent)
      : DEFAULT_BILLBOARD_PALETTE.accent;
  return { background, accent, ink: luminance(background) > 0.45 ? '#0f172a' : '#ffffff' };
}

export function buildBillboardSvg(params: {
  kind: BillboardKind;
  plan: BillboardPlan;
  organizationName: string;
  courseTitle: string;
  language: BillboardLanguage;
  palette: BillboardPalette;
  /** Logo de l'organisation déjà converti en image intégrée (data URI PNG), ou absent. */
  logoDataUri?: string;
}): string {
  const { kind, plan, palette, language } = params;
  const texts = TEXTS[language];
  const identity = plan.showOrganization ? params.organizationName : 'Qalem';
  const logo = plan.showOrganization ? params.logoDataUri : undefined;
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const titleLines = wrapText(params.courseTitle, 34, 2);
  const headline = kind === 'entry' ? titleLines : [texts.exitTitle];
  const headlineSize = kind === 'entry' ? 76 : 80;
  const headlineSpans = headline
    .map(
      (line, index) =>
        `<tspan x="960" dy="${index === 0 ? 0 : headlineSize + 14}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const subtitle = kind === 'entry' ? texts.entry : params.courseTitle;
  const subtitleLine = wrapText(subtitle, 60, 1)[0] ?? '';
  const mark = logo
    ? `<image href="${logo}" x="660" y="170" width="600" height="300" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="960" y="360" text-anchor="middle" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="120" font-weight="800">${escapeXml(identity)}</text>`;
  const credit =
    plan.showOrganization && plan.showQalem
      ? `<text x="960" y="990" text-anchor="middle" fill="${palette.ink}" fill-opacity="0.7" font-family="Arial, sans-serif" font-size="30" font-weight="600">${escapeXml(texts.credit)}</text>`
      : '';
  const organizationLine = logo
    ? `<text x="960" y="520" text-anchor="middle" fill="${palette.ink}" fill-opacity="0.85" font-family="Arial, sans-serif" font-size="38" font-weight="600" letter-spacing="2">${escapeXml(identity)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" direction="${direction}">
  <rect width="1920" height="1080" fill="${palette.background}"/>
  <rect x="0" y="0" width="1920" height="14" fill="${palette.accent}"/>
  <rect x="860" y="${logo ? 556 : 430}" width="200" height="8" rx="4" fill="${palette.accent}"/>
  ${mark}
  ${organizationLine}
  <text x="960" y="${logo ? 700 : 600}" text-anchor="middle" fill="${palette.ink}" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="800">${headlineSpans}</text>
  <text x="960" y="${logo ? 900 : 860}" text-anchor="middle" fill="${palette.ink}" fill-opacity="0.75" font-family="Arial, sans-serif" font-size="36" font-weight="500">${escapeXml(subtitleLine)}</text>
  ${credit}
</svg>`;
}
