import type { Stage } from '@openmaic/dsl';
import { DESIGN_FONTS } from '@openmaic/dsl';
import tinycolor from 'tinycolor2';
import {
  buildPalette,
  DEFAULT_DESIGN_DIRECTIVE,
  normalizeDesignDirective,
} from './design-directive';

export const INTERACTIVE_DESIGN_PROMPT_MODULE = `DESIGN SYSTEM QALEM (priorité sur les exemples visuels antérieurs)
Utilise exclusivement les variables CSS --q-* injectées dans :root pour toute couleur et police ; aucun hexadécimal, nom de couleur, dégradé coloré ni police en dur dans le HTML, le CSS ou le SVG. Le fond, les surfaces, le texte et les bordures viennent des tokens. Pour les données, utilise --q-accent, --q-accent-alt et --q-accent-tertiary avec formes, motifs et libellés directs : jamais la couleur seule. Les états juste/faux/alerte utilisent --q-ok/--q-error/--q-warn et leurs variantes --q-on-ok/--q-on-error/--q-on-warn, toujours doublés d'un libellé ou d'une icône accessible. Utilise --q-info pour l'information. Prévois un focus visible, des cibles d'au moins 44 px et un état initial compréhensible sans interaction, y compris en capture MP4/SCORM. Aucune animation ne doit porter seule une information. Les polices sont locales ou système, sans chargement distant. Respecte les données et le fonctionnement pédagogique avant l'habillage.`;

export const INTERACTIVE_DESIGN_CSS_VARIABLES = [
  '--q-bg',
  '--q-surface',
  '--q-surface-alt',
  '--q-text',
  '--q-text-muted',
  '--q-accent',
  '--q-accent-contrast',
  '--q-border',
  '--q-radius',
  '--q-font-heading',
  '--q-font-body',
  '--q-font-mono',
  '--q-ok',
  '--q-on-ok',
  '--q-error',
  '--q-on-error',
  '--q-warn',
  '--q-on-warn',
  '--q-info',
  '--q-on-info',
  '--q-accent-alt',
  '--q-accent-tertiary',
] as const;

type InteractiveTokens = Record<(typeof INTERACTIVE_DESIGN_CSS_VARIABLES)[number], string>;

function snapshotColors(snapshot: Stage['brandSnapshot']): Record<string, string> {
  if (snapshot?.version !== 1 || !snapshot.content) return {};
  const colorLine = snapshot.content.match(/(?:^|\n)colors:\s*([^\n]*)/u)?.[1] ?? '';
  const colors: Record<string, string> = {};
  for (const match of colorLine.matchAll(
    /\b(background|surface|ink|accent|muted|secondary)=(#[\da-fA-F]{6})\b/gu,
  )) {
    colors[match[1]] = match[2].toUpperCase();
  }
  return colors;
}

function snapshotFont(snapshot: Stage['brandSnapshot']): string | undefined {
  if (snapshot?.version !== 1 || !snapshot.content) return undefined;
  const requested = snapshot.content.match(/(?:^|\n)fonts:\s*display=([^;\n]+)/u)?.[1]?.trim();
  return DESIGN_FONTS.find((font) => font.toLowerCase() === requested?.toLowerCase());
}

function foregroundOn(background: string): string {
  const black = '#111827';
  const white = '#FFFFFF';
  return tinycolor.readability(black, background) >= tinycolor.readability(white, background)
    ? black
    : white;
}

export function buildInteractiveDesignTokens(
  directiveInput: Stage['designDirective'],
  snapshot: Stage['brandSnapshot'],
): InteractiveTokens {
  const directive = directiveInput
    ? normalizeDesignDirective(directiveInput).directive
    : DEFAULT_DESIGN_DIRECTIVE;
  const palette = buildPalette(directive);
  const brand = snapshotColors(snapshot);
  const headingFont = snapshotFont(snapshot) ?? directive.typography.heading;
  const bodyFont = directive.typography.body;
  const accent = brand.accent ?? palette['accent.primary'];
  const accentAlt = brand.secondary ?? palette['accent.secondary'];
  const functional = {
    ok: palette['functional.correct'],
    error: palette['functional.incorrect'],
    warn: palette['functional.warning'],
    info: palette['functional.info'],
  };
  const colors: InteractiveTokens = {
    '--q-bg': brand.background ?? brand.surface ?? palette['surface.base'],
    '--q-surface': palette['surface.card.onBase'],
    '--q-surface-alt': brand.muted ?? palette['surface.tint'],
    '--q-text': brand.ink ?? palette['text.primary'],
    '--q-text-muted': palette['text.secondary'],
    '--q-accent': accent,
    '--q-accent-contrast': foregroundOn(accent),
    '--q-border': palette['border.hairline'],
    '--q-radius': `${directive.shapes.radius}px`,
    '--q-font-heading': `'${headingFont}', system-ui, sans-serif`,
    '--q-font-body': `'${bodyFont}', system-ui, sans-serif`,
    '--q-font-mono': `'JetBrains Mono', ui-monospace, monospace`,
    '--q-ok': functional.ok,
    '--q-on-ok': foregroundOn(functional.ok),
    '--q-error': functional.error,
    '--q-on-error': foregroundOn(functional.error),
    '--q-warn': functional.warn,
    '--q-on-warn': foregroundOn(functional.warn),
    '--q-info': functional.info,
    '--q-on-info': foregroundOn(functional.info),
    '--q-accent-alt': accentAlt,
    '--q-accent-tertiary': palette['accent.achievement'],
  };
  return colors;
}

export function buildInteractiveDesignStyle(tokens: InteractiveTokens): string {
  const declarations = INTERACTIVE_DESIGN_CSS_VARIABLES.map(
    (name) => `${name}:${tokens[name]}`,
  ).join(';');
  return `<style id="qalem-design-tokens">:root{${declarations}}html,body{min-height:100%;margin:0;background:var(--q-bg);color:var(--q-text);font-family:var(--q-font-body)}body *{box-sizing:border-box}h1,h2,h3,h4{font-family:var(--q-font-heading)}button,input,select,textarea{font:inherit}button,[role="button"],input,select,textarea{touch-action:manipulation}button:focus-visible,[role="button"]:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--q-accent);outline-offset:2px}button,[role="button"]{min-height:44px}code,pre,kbd,samp{font-family:var(--q-font-mono)}</style>`;
}

export function applyInteractiveDesignSystem(
  html: string,
  directive: Stage['designDirective'],
  snapshot: Stage['brandSnapshot'],
): string {
  if (!directive && !(snapshot?.version === 1 && snapshot.content)) return html;
  if (html.includes('id="qalem-design-tokens"')) return html;
  const style = buildInteractiveDesignStyle(buildInteractiveDesignTokens(directive, snapshot));
  const headClose = html.search(/<\/head\s*>/iu);
  if (headClose >= 0) return `${html.slice(0, headClose)}${style}${html.slice(headClose)}`;
  const bodyOpen = html.search(/<body(?:\s|>)/iu);
  if (bodyOpen >= 0) {
    const bodyTagEnd = html.indexOf('>', bodyOpen);
    return `${html.slice(0, bodyTagEnd + 1)}${style}${html.slice(bodyTagEnd + 1)}`;
  }
  return `${style}${html}`;
}
