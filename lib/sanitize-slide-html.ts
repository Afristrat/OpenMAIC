/**
 * Assainisseur HTML à liste blanche pour le contenu des slides.
 *
 * Le HTML des slides (texte riche, cellules de tableau, formes, formules KaTeX
 * pré-rendues) provient du LLM, d'imports PPTX ou d'éditions, donc de données non
 * fiables. Tout point de rendu qui l'injecte avec `dangerouslySetInnerHTML` DOIT
 * passer par `sanitizeSlideHtml`.
 *
 * Principe : le HTML est analysé par le parseur natif (DOMParser, document inerte,
 * aucun script ni chargement), puis un arbre NEUF est reconstruit élément par
 * élément à partir de la liste blanche (balises, attributs, propriétés CSS). Rien
 * n'est copié par défaut et aucune expression régulière ne sert à lire des balises.
 * Sans DOMParser (rendu serveur), tout le HTML est échappé : repli sûr.
 *
 * COPIE : ce fichier existe à l'identique dans
 * packages/@openmaic/renderer/src/utils/sanitize-slide-html.ts (le paquet est publié
 * et ne peut pas importer depuis lib/). Un test de non-dérive en garde l'égalité.
 * Ne pas y ajouter d'import.
 *
 * ponytail: assainisseur maison sans dépendance, couverture limitée au HTML de slides
 * (pas de SVG hors KaTeX, pas de MathML hors KaTeX, un seul parseur, le navigateur) ;
 * réexaminer en remplaçant par DOMPurify dès que la dépendance peut être déclarée.
 */

export type SlideHtmlProfile = 'rich-text' | 'katex';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Profondeur maximale d'imbrication conservée (protège la pile et les contenus pathologiques). */
const MAX_DEPTH = 64;

const RICH_TEXT_TAGS = new Set([
  'p',
  'div',
  'span',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'mark',
  'small',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'kbd',
  'samp',
  'q',
  'cite',
  'abbr',
  'font',
  'img',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
]);
const KATEX_HTML_TAGS = new Set(['span']);

/** Balises supprimées AVEC leur contenu. Toute autre balise inconnue est « déballée » (enfants conservés). */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'noscript',
  'noembed',
  'noframes',
  'template',
  'textarea',
  'title',
  'select',
  'datalist',
  'xmp',
  'plaintext',
  'listing',
  'head',
  'link',
  'meta',
  'base',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'map',
  'area',
  'dialog',
  'slot',
  'portal',
  'svg',
  'math',
  'input',
]);

const SVG_TAGS = new Set(['svg', 'path', 'line']);
const MATHML_TAGS = new Set([
  'math',
  'semantics',
  'annotation',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mtext',
  'mspace',
  'mfrac',
  'msqrt',
  'mroot',
  'msup',
  'msub',
  'msubsup',
  'mover',
  'munder',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mstyle',
  'menclose',
  'mpadded',
  'mphantom',
]);

const GLOBAL_HTML_ATTRS = new Set(['style', 'class', 'dir', 'lang', 'title', 'aria-hidden']);
const HTML_TAG_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'target']),
  img: new Set(['src', 'alt', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'align', 'valign', 'width', 'height', 'scope']),
  td: new Set(['colspan', 'rowspan', 'align', 'valign', 'width', 'height']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span']),
  ol: new Set(['start', 'type', 'reversed']),
  li: new Set(['value']),
  font: new Set(['color', 'face', 'size']),
};
const SVG_TAG_ATTRS: Record<string, ReadonlySet<string>> = {
  svg: new Set(['width', 'height', 'viewBox', 'preserveAspectRatio', 'class', 'style']),
  path: new Set(['d', 'class', 'style']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke-width', 'class', 'style']),
};
const MATHML_ATTRS = new Set([
  'accent',
  'accentunder',
  'columnalign',
  'columnlines',
  'columnspacing',
  'depth',
  'display',
  'displaystyle',
  'encoding',
  'fence',
  'height',
  'largeop',
  'linebreak',
  'linethickness',
  'lspace',
  'mathbackground',
  'mathcolor',
  'mathsize',
  'mathvariant',
  'maxsize',
  'minsize',
  'notation',
  'rowlines',
  'rowspacing',
  'rspace',
  'scriptlevel',
  'separator',
  'stretchy',
  'valign',
  'voffset',
  'width',
]);

// ---------------------------------------------------------------------------
// Valeurs d'attributs
// ---------------------------------------------------------------------------

const SAFE_TOKEN_VALUE = /^[\w\s.%+\-#,/()'"]{0,200}$/u;
const SAFE_PATH_DATA = /^[\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]{0,100000}$/;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/i;
/** Classes utilitaires de positionnement (Tailwind) refusées : elles permettraient de recouvrir l'interface. */
const FORBIDDEN_CLASS =
  /^-?(?:fixed|absolute|sticky|relative|inset|top|left|right|bottom|z|float)(?:-|$)/;

function removeControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) out += ch;
  }
  return out;
}

function safeUrl(value: string, protocols: readonly string[]): string | null {
  const compact = removeControlChars(value);
  if (compact === '' || compact.length > 8192) return null;
  try {
    const url = new URL(compact);
    return protocols.includes(url.protocol) ? compact : null;
  } catch {
    return null;
  }
}

function safeImageSrc(value: string): string | null {
  const compact = removeControlChars(value);
  if (/^data:/i.test(compact)) return SAFE_DATA_IMAGE.test(compact) ? compact : null;
  return safeUrl(compact, ['http:', 'https:']);
}

function safeClass(value: string): string {
  return value
    .split(/\s+/u)
    .filter((token) => /^[A-Za-z_][\w-]{0,63}$/u.test(token) && !FORBIDDEN_CLASS.test(token))
    .join(' ');
}

// ---------------------------------------------------------------------------
// CSS en ligne
// ---------------------------------------------------------------------------

const ALLOWED_CSS_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'background-clip',
  '-webkit-background-clip',
  '-webkit-text-fill-color',
  '-webkit-text-stroke',
  '-webkit-text-stroke-width',
  '-webkit-text-stroke-color',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'word-break',
  'overflow-wrap',
  'white-space',
  'vertical-align',
  'direction',
  'unicode-bidi',
  'writing-mode',
  'opacity',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'display',
  'position',
  'overflow',
  'overflow-x',
  'overflow-y',
  'list-style-type',
  'list-style-position',
  'border-collapse',
  'border-spacing',
  'table-layout',
  'hyphens',
  'top',
  'left',
  'right',
  'bottom',
]);
/** Décalages (KaTeX en dépend) : valeur bornée, sinon un contenu relatif pourrait être projeté sur l'interface. */
const OFFSET_PROPERTIES = new Set(['top', 'left', 'right', 'bottom']);
const BOUNDED_OFFSET = /^(-?\d*\.?\d+)(?:em|rem|ex|px|pt|%)$/i;
const ALLOWED_CSS_PROPERTY_FAMILIES: readonly RegExp[] = [
  /^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/,
  /^border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?$/,
  /^border(?:-(?:top|bottom)-(?:left|right))?-radius$/,
  /^font(?:-[a-z]+)*$/,
  /^text-(?:align|align-last|indent|decoration(?:-[a-z]+)?|shadow|transform|justify|orientation|overflow)$/,
];
const ALLOWED_CSS_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'calc',
  'min',
  'max',
  'clamp',
  'var',
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
]);
const CSS_ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  position: new Set(['static', 'relative']),
  display: new Set([
    'block',
    'inline',
    'inline-block',
    'list-item',
    'table',
    'table-row',
    'table-cell',
    'none',
  ]),
  overflow: new Set(['visible', 'hidden', 'clip']),
  'overflow-x': new Set(['visible', 'hidden', 'clip']),
  'overflow-y': new Set(['visible', 'hidden', 'clip']),
};
/** Unités relatives à la fenêtre : refusées (un bloc plein écran recouvrirait l'interface). */
const VIEWPORT_UNIT = /\d(?:vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh)\b/i;
const FORBIDDEN_CSS_VALUE = /[\\<>@{}]|\/\*|\*\/|javascript|vbscript|expression|behavior|binding/i;

function isAllowedCssProperty(prop: string): boolean {
  return (
    ALLOWED_CSS_PROPERTIES.has(prop) ||
    ALLOWED_CSS_PROPERTY_FAMILIES.some((family) => family.test(prop))
  );
}

/** Découpe une déclaration CSS sur `;` hors guillemets et hors parenthèses. */
function splitDeclarations(css: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function hasOnlyAllowedCssFunctions(value: string): boolean {
  for (const match of value.matchAll(/([a-z-]+)\s*\(/gi)) {
    if (!ALLOWED_CSS_FUNCTIONS.has(match[1].toLowerCase())) return false;
  }
  return true;
}

export function sanitizeInlineStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of splitDeclarations(style)) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/\s*!important\s*$/i, '')
      .trim();
    if (!isAllowedCssProperty(prop) || value === '' || value.length > 300) continue;
    if (/[\u0000-\u001f\u007f]/.test(value)) continue;
    if (FORBIDDEN_CSS_VALUE.test(value) || VIEWPORT_UNIT.test(value)) continue;
    if (!hasOnlyAllowedCssFunctions(value)) continue;
    if (OFFSET_PROPERTIES.has(prop)) {
      const offset = BOUNDED_OFFSET.exec(value);
      if (!offset || Math.abs(Number(offset[1])) > 1000) continue;
    }
    const allowed = CSS_ENUM_VALUES[prop];
    if (allowed && !allowed.has(value.toLowerCase())) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join('; ');
}

// ---------------------------------------------------------------------------
// Reconstruction de l'arbre
// ---------------------------------------------------------------------------

interface Context {
  readonly out: Document;
  readonly profile: SlideHtmlProfile;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isText(node: Node): node is Text {
  return node.nodeType === 3;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Retourne la valeur d'attribut assainie, ou null pour l'écarter. */
function sanitizeHtmlAttribute(tag: string, name: string, value: string): string | null {
  switch (name) {
    case 'style': {
      const style = sanitizeInlineStyle(value);
      return style === '' ? null : style;
    }
    case 'class': {
      const classes = safeClass(value);
      return classes === '' ? null : classes;
    }
    case 'aria-hidden':
      return value === 'true' || value === 'false' ? value : null;
    case 'dir':
      return /^(?:ltr|rtl|auto)$/i.test(value) ? value.toLowerCase() : null;
    case 'lang':
      return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8}){0,3}$/.test(value) ? value : null;
    case 'href':
      return tag === 'a' ? safeUrl(value, ['http:', 'https:', 'mailto:', 'tel:']) : null;
    case 'target':
      return value === '_blank' ? value : null;
    case 'src':
      return tag === 'img' ? safeImageSrc(value) : null;
    default:
      return SAFE_TOKEN_VALUE.test(value) || name === 'alt' || name === 'title'
        ? value.slice(0, 500)
        : null;
  }
}

function copyHtmlAttributes(src: Element, dst: Element, tag: string): void {
  const tagAttrs = HTML_TAG_ATTRS[tag];
  for (const attr of Array.from(src.attributes)) {
    const name = attr.name.toLowerCase();
    if (!GLOBAL_HTML_ATTRS.has(name) && !tagAttrs?.has(name)) continue;
    const value = sanitizeHtmlAttribute(tag, name, attr.value);
    if (value !== null) dst.setAttribute(name, value);
  }
  if (tag === 'a') dst.setAttribute('rel', 'noopener noreferrer');
}

function copyForeignAttributes(src: Element, dst: Element, tag: string, ns: string): void {
  const allowed = ns === SVG_NS ? SVG_TAG_ATTRS[tag] : MATHML_ATTRS;
  for (const attr of Array.from(src.attributes)) {
    if (!allowed?.has(attr.name)) continue;
    let value: string | null;
    if (attr.name === 'style') {
      const style = sanitizeInlineStyle(attr.value);
      value = style === '' ? null : style;
    } else if (attr.name === 'class') {
      const classes = safeClass(attr.value);
      value = classes === '' ? null : classes;
    } else if (attr.name === 'd') {
      value = SAFE_PATH_DATA.test(attr.value) ? attr.value : null;
    } else {
      value = SAFE_TOKEN_VALUE.test(attr.value) ? attr.value : null;
    }
    if (value !== null) dst.setAttribute(attr.name, value);
  }
}

function copyChildren(src: Node, dst: Node, parentNs: string, depth: number, ctx: Context): void {
  for (const child of Array.from(src.childNodes)) {
    if (isText(child)) {
      dst.appendChild(ctx.out.createTextNode(child.data));
    } else if (isElement(child)) {
      copyElement(child, dst, parentNs, depth, ctx);
    }
    // commentaires, instructions de traitement, CDATA : ignorés
  }
}

function copyElement(el: Element, dst: Node, parentNs: string, depth: number, ctx: Context): void {
  if (depth > MAX_DEPTH) return;
  const ns = el.namespaceURI ?? '';
  const tag = el.localName;

  if (ns === XHTML_NS) {
    // Un élément HTML sous svg/math (points d'intégration) est une porte d'entrée de mXSS : refusé.
    if (parentNs !== XHTML_NS || DROP_WITH_CONTENT.has(tag)) return;
    const htmlTags = ctx.profile === 'katex' ? KATEX_HTML_TAGS : RICH_TEXT_TAGS;
    if (!htmlTags.has(tag)) {
      copyChildren(el, dst, XHTML_NS, depth, ctx); // balise inconnue : on garde le texte
      return;
    }
    const clone = ctx.out.createElement(tag);
    copyHtmlAttributes(el, clone, tag);
    if (tag === 'img' && !clone.hasAttribute('src')) return;
    dst.appendChild(clone);
    copyChildren(el, clone, XHTML_NS, depth + 1, ctx);
    return;
  }

  if (ctx.profile !== 'katex') return;
  const allowedForeign =
    (ns === SVG_NS && SVG_TAGS.has(tag)) || (ns === MATHML_NS && MATHML_TAGS.has(tag));
  // Un enfant svg/math sous un parent d'un autre espace de noms est refusé (sauf racine sous HTML).
  const validParent =
    parentNs === ns || (parentNs === XHTML_NS && (tag === 'svg' || tag === 'math'));
  if (!allowedForeign || !validParent) return;
  const clone = ctx.out.createElementNS(ns, tag);
  copyForeignAttributes(el, clone, tag, ns);
  dst.appendChild(clone);
  copyChildren(el, clone, ns, depth + 1, ctx);
}

/**
 * Assainit un fragment HTML de slide et retourne un HTML sûr à injecter.
 * Jamais d'exception : en cas d'échec ou d'absence de DOM, tout est échappé.
 */
export function sanitizeSlideHtml(html: unknown, profile: SlideHtmlProfile = 'rich-text'): string {
  if (typeof html !== 'string' || html === '') return '';
  if (typeof DOMParser === 'undefined') return escapeHtml(html);
  try {
    const parser = new DOMParser();
    const source = parser.parseFromString(`<!DOCTYPE html><html><body>${html}`, 'text/html');
    const out = parser.parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html');
    copyChildren(source.body, out.body, XHTML_NS, 0, { out, profile });
    return out.body.innerHTML;
  } catch {
    return escapeHtml(html);
  }
}
