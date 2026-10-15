/**
 * Non-régression du XSS stocké via le HTML des slides.
 *
 * - Les tests « navigateur » exécutent l'assainisseur dans un vrai Chromium (Playwright) :
 *   le parseur HTML natif est le seul juge fiable d'une mutation (mXSS). Ils sont ignorés
 *   (avec un avertissement) si Chromium n'est pas installé sur le poste.
 * - Les tests « nœud » (CSS, repli sans DOM, non-dérive des copies, gardes statiques sur
 *   les points de rendu) tournent partout, y compris en CI.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import katex from 'katex';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sanitizeInlineStyle, sanitizeSlideHtml } from '@/lib/sanitize-slide-html';

const ROOT = resolve(__dirname, '../..');
const APP_MODULE = resolve(ROOT, 'lib/sanitize-slide-html.ts');
const PACKAGE_MODULE = resolve(
  ROOT,
  'packages/@openmaic/renderer/src/utils/sanitize-slide-html.ts',
);

// ---------------------------------------------------------------------------
// Tests nœud (sans DOM)
// ---------------------------------------------------------------------------

describe('sanitizeInlineStyle', () => {
  test('conserve les styles PowerPoint et les couleurs du design système', () => {
    const css =
      "color: rgb(10, 20, 30); font-family: 'Microsoft YaHei', sans-serif; font-size: 18pt; " +
      'font-weight: bold; text-align: center; line-height: 1.5; letter-spacing: 0.5px; ' +
      'margin-left: calc(10px + 5px); text-indent: -10px; padding: 0px 4px; ' +
      'text-decoration: underline line-through; display: inline-block; width: 12px; ' +
      'position: relative; white-space: nowrap; background-color: var(--primary);';
    const out = sanitizeInlineStyle(css);
    for (const fragment of [
      'color: rgb(10, 20, 30)',
      "font-family: 'Microsoft YaHei', sans-serif",
      'font-size: 18pt',
      'font-weight: bold',
      'text-align: center',
      'margin-left: calc(10px + 5px)',
      'text-indent: -10px',
      'text-decoration: underline line-through',
      'display: inline-block',
      'position: relative',
      'background-color: var(--primary)',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  test('un point-virgule dans une chaîne entre guillemets ne coupe pas la déclaration', () => {
    expect(sanitizeInlineStyle('font-family: "A;B", serif')).toBe('font-family: "A;B", serif');
  });

  test.each([
    ['url()', 'background: url(https://evil.test/x.png)'],
    ['url(javascript:)', 'background-color: red; background: url(javascript:alert(1))'],
    ['expression()', 'width: expression(alert(1))'],
    ['@import', 'color: red; @import url(x.css)'],
    ['behavior', 'behavior: url(x.htc)'],
    ['-moz-binding', '-moz-binding: url(x.xml#a)'],
    ['position fixed', 'position: fixed; top: 0'],
    ['position absolute', 'position: absolute'],
    ['échappement CSS', 'color: \\75 rl(x)'],
    ['unité de fenêtre', 'width: 100vw'],
    ['propriété inconnue', 'z-index: 99999'],
    ['cursor', 'cursor: url(x.cur), auto'],
    ['border-image', 'border-image: url(x.png) 1'],
    ['display flex', 'display: flex'],
    ['caractère de contrôle', 'color: re\u0000d'],
  ])('refuse %s', (_label, css) => {
    const out = sanitizeInlineStyle(css);
    expect(out).not.toMatch(
      /url\(|expression|import|binding|behavior|fixed|absolute|vw|z-index|cursor|border-image|flex|\\/i,
    );
  });

  test('entrée vide ou sans déclaration valide', () => {
    expect(sanitizeInlineStyle('')).toBe('');
    expect(sanitizeInlineStyle('nonsense;;:::')).toBe('');
  });
});

describe('sanitizeSlideHtml sans DOM (rendu serveur)', () => {
  test('échappe tout le HTML au lieu de le laisser passer', () => {
    expect(typeof DOMParser).toBe('undefined');
    const out = sanitizeSlideHtml('<p onclick="x">a</p><script>alert(1)</script>');
    expect(out).not.toContain('<');
    expect(out).toContain('&lt;script&gt;');
  });

  test.each([[null], [undefined], [42], [{}], [''], [['<b>']]])(
    'entrée non textuelle ou vide %j renvoie une chaîne vide',
    (input) => {
      expect(sanitizeSlideHtml(input)).toBe('');
    },
  );
});

describe("copies de l'assainisseur", () => {
  test("le module du paquet renderer est identique à celui de l'application", () => {
    expect(existsSync(PACKAGE_MODULE)).toBe(true);
    expect(readFileSync(PACKAGE_MODULE, 'utf8')).toBe(readFileSync(APP_MODULE, 'utf8'));
  });
});

describe('points de rendu du HTML de slide', () => {
  const RENDER_POINTS: ReadonlyArray<readonly [string, number]> = [
    ['components/slide-renderer/components/element/TextElement/BaseTextElement.tsx', 1],
    ['components/slide-renderer/components/element/ShapeElement/BaseShapeElement.tsx', 1],
    ['components/slide-renderer/components/element/TableElement/StaticTable.tsx', 1],
    ['components/slide-renderer/components/element/LatexElement/BaseLatexElement.tsx', 1],
    ['components/slide-renderer/components/element/LatexElement/index.tsx', 1],
    ['packages/@openmaic/renderer/src/elements/text/BaseTextElement.tsx', 1],
    ['packages/@openmaic/renderer/src/elements/shape/BaseShapeElement.tsx', 1],
    ['packages/@openmaic/renderer/src/elements/table/StaticTable.tsx', 1],
    ['packages/@openmaic/renderer/src/elements/latex/BaseLatexElement.tsx', 1],
  ];

  test.each(RENDER_POINTS)('%s assainit chaque injection', (file, expected) => {
    const src = readFileSync(resolve(ROOT, file), 'utf8');
    const injections = [...src.matchAll(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/g)];
    expect(injections).toHaveLength(expected);
    for (const injection of injections) {
      expect(injection[1]).toMatch(/safe|sanitize/i);
    }
    expect(src).toMatch(/sanitize-slide-html/);
  });

  test("l'importeur n'analyse plus le HTML d'une cellule avec innerHTML", () => {
    const src = readFileSync(
      resolve(ROOT, 'packages/@openmaic/importer/src/import-pipeline/transformParsedToSlides.ts'),
      'utf8',
    );
    // Un élément créé par `document` charge les images (onerror) : il faut un document inerte.
    expect(src).not.toMatch(/textDiv: HTMLDivElement \| null = document\.createElement/);
    expect(src).toMatch(/textDiv: HTMLDivElement \| null = inertDoc\.createElement\('div'\)/);
    expect(src).toMatch(/new DOMParser\(\)\.parseFromString/);
  });
});

// ---------------------------------------------------------------------------
// Tests navigateur (Chromium réel)
// ---------------------------------------------------------------------------

const hasChromium = existsSync(chromium.executablePath());
if (!hasChromium) {
  console.warn('[sanitize-slide-html] Chromium absent : tests navigateur ignorés.');
}

interface Inspection {
  xss: unknown;
  violations: string[];
}

let browser: Browser;
let page: Page;

async function sanitizeInBrowser(
  html: string,
  profile: 'rich-text' | 'katex' = 'rich-text',
): Promise<string> {
  return page.evaluate(
    ([h, p]) => {
      const fn: unknown = Reflect.get(window, '__sanitize');
      if (typeof fn !== 'function') throw new Error('assainisseur non chargé');
      return String(fn(h, p));
    },
    [html, profile] as const,
  );
}

/** Monte le HTML assaini dans la page, laisse passer les événements, liste les violations. */
async function inspect(sanitized: string): Promise<Inspection> {
  return page.evaluate(async (html) => {
    Reflect.set(window, '__xss', undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = html;
    await new Promise((r) => setTimeout(r, 150));
    const banned = new Set([
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'link',
      'meta',
      'base',
      'form',
      'input',
      'button',
      'textarea',
      'template',
      'noscript',
      'foreignobject',
      'annotation-xml',
      'mglyph',
      'use',
      'animate',
      'set',
      'a:svg',
    ]);
    const violations: string[] = [];
    for (const el of Array.from(host.querySelectorAll('*'))) {
      const tag = el.localName.toLowerCase();
      if (banned.has(tag)) violations.push(`balise ${tag}`);
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.toLowerCase().replace(/\s/g, '');
        if (name.startsWith('on')) violations.push(`attribut ${name}`);
        if (name === 'srcdoc' || name === 'formaction' || name === 'xlink:href')
          violations.push(`attribut ${name}`);
        if (/javascript:|vbscript:/.test(value)) violations.push(`valeur ${name}=${value}`);
        if (
          name === 'style' &&
          /url\(|expression|@import|position:fixed|position:absolute/.test(value)
        ) {
          violations.push(`style ${value}`);
        }
        if (name === 'href' && !/^(https?:|mailto:|tel:)/.test(value))
          violations.push(`href ${value}`);
        if (name === 'id' || name === 'name') violations.push(`attribut ${name}`);
      }
    }
    const result = { xss: Reflect.get(window, '__xss'), violations };
    host.remove();
    return result;
  }, sanitized);
}

beforeAll(async () => {
  if (!hasChromium) return;
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto('about:blank');
  const source = readFileSync(APP_MODULE, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  await page.evaluate((code) => {
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    new Function('module', 'exports', code)(mod, mod.exports);
    Reflect.set(window, '__sanitize', mod.exports.sanitizeSlideHtml);
  }, outputText);
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

const ATTACKS: ReadonlyArray<readonly [string, string]> = [
  ['script', '<p>ok</p><script>window.__xss=1</script>'],
  [
    'script majuscules et variantes',
    '<ScRiPt>window.__xss=1</ScRiPt><scr<script>ipt>window.__xss=1</scr</script>ipt>',
  ],
  ['img onerror', '<img src=x onerror="window.__xss=1">'],
  [
    'img onerror avec src http',
    '<img src="https://127.0.0.1:9/x.png" onerror="window.__xss=1" onload="window.__xss=1">',
  ],
  [
    'gestionnaires on*',
    '<p onclick="window.__xss=1" onmouseover="window.__xss=1" onfocus=window.__xss=1 autofocus>x</p>',
  ],
  ['href javascript', '<a href="javascript:window.__xss=1">x</a>'],
  ['href javascript avec espaces et retours', '<a href="  jav\nasc\tript:window.__xss=1">x</a>'],
  ['href javascript en entités', '<a href="&#106;&#97;vascript:window.__xss=1">x</a>'],
  [
    'href data html',
    '<a href="data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3M9MTwvc2NyaXB0Pg==">x</a>',
  ],
  ['href vbscript', '<a href="vbscript:msgbox(1)">x</a>'],
  ['style url(javascript:)', '<p style="background:url(javascript:window.__xss=1)">x</p>'],
  ['style expression', '<p style="width:expression(window.__xss=1)">x</p>'],
  ['style @import', '<p style="@import url(//evil.test/x.css)">x</p>'],
  ['style position fixed', '<p style="position:fixed;top:0;left:0;width:100%;height:100%">x</p>'],
  ['svg onload', '<svg onload="window.__xss=1"><circle r="5"/></svg>'],
  ['svg script', '<svg><script>window.__xss=1</script></svg>'],
  ['svg animate', '<svg><animate onbegin="window.__xss=1" attributeName="x" dur="1s"/></svg>'],
  ['math href', '<math href="javascript:window.__xss=1"><mi>x</mi></math>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>parent.__xss=1</script>"></iframe>'],
  ['iframe src javascript', '<iframe src="javascript:parent.__xss=1"></iframe>'],
  [
    'object et embed',
    '<object data="javascript:window.__xss=1"></object><embed src="javascript:window.__xss=1">',
  ],
  [
    'link et meta et base',
    '<link rel="stylesheet" href="//evil.test/x.css"><meta http-equiv="refresh" content="0;url=javascript:window.__xss=1"><base href="//evil.test/">',
  ],
  ['balise style', '<style>*{display:none}</style><p>x</p>'],
  [
    'form',
    '<form action="javascript:window.__xss=1"><input name="a" formaction="javascript:window.__xss=1"><button formaction="javascript:window.__xss=1">go</button></form>',
  ],
  [
    'img data svg',
    '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9IndpbmRvdy5fX3hzcz0xIj48L3N2Zz4=">',
  ],
  ['img data html', '<img src="data:text/html,<script>window.__xss=1</script>">'],
  ['img javascript', '<img src="javascript:window.__xss=1">'],
  [
    'mXSS noscript',
    '<noscript><p title="</noscript><img src=x onerror=window.__xss=1>"></p></noscript>',
  ],
  ['mXSS svg style', '<svg></p><style><a id="</style><img src=1 onerror=window.__xss=1>">'],
  [
    'mXSS math mtext mglyph',
    '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=window.__xss=1&gt;">',
  ],
  ['mXSS textarea', '<textarea><img src=x onerror=window.__xss=1></textarea>'],
  [
    'mXSS xmp et title',
    '<xmp><img src=x onerror=window.__xss=1></xmp><title></title><img src=x onerror=window.__xss=1>',
  ],
  [
    'mXSS table foster parenting',
    '<table><a href="javascript:window.__xss=1">x</a><tr><td><img src=x onerror=window.__xss=1></td></tr></table>',
  ],
  [
    'commentaire conditionnel',
    '<!--[if IE]><img src=x onerror=window.__xss=1><![endif]--><p>x</p>',
  ],
  ['clobbering', '<p id="__NEXT_DATA__" name="cookie">x</p>'],
];

describe.skipIf(!hasChromium)('sanitizeSlideHtml dans Chromium : attaques', () => {
  test.each(ATTACKS)('neutralise : %s', async (_label, payload) => {
    const out = await sanitizeInBrowser(payload);
    const report = await inspect(out);
    expect(report.xss).toBeUndefined();
    expect(report.violations).toEqual([]);
    // Idempotence : réassainir la sortie ne change rien, donc aucune mutation au re-parsing.
    expect(await sanitizeInBrowser(out)).toBe(out);
  });

  test('un lien http(s) reçoit rel="noopener noreferrer", le texte est conservé', async () => {
    const out = await sanitizeInBrowser(
      '<a href="https://example.org/a?b=1" target="_blank" rel="opener">lien</a>',
    );
    expect(out).toContain('href="https://example.org/a?b=1"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain('opener"');
  });

  test('une balise inconnue est déballée, le texte est conservé', async () => {
    expect(await sanitizeInBrowser('<custom-tag><b>gras</b></custom-tag>')).toBe('<b>gras</b>');
  });

  test('imbrication pathologique : pas de plantage, profondeur bornée', async () => {
    const deep = '<div>'.repeat(5000) + 'x' + '</div>'.repeat(5000);
    const out = await sanitizeInBrowser(deep);
    expect(out.length).toBeLessThan(deep.length);
  });

  test('gros volume (10 000 paragraphes) assaini sans erreur', async () => {
    const big = '<p style="color:#123456">x</p>'.repeat(10_000);
    const out = await sanitizeInBrowser(big);
    expect(out.match(/<p /g)).toHaveLength(10_000);
  });

  test('caractères spéciaux, emojis et arabe conservés tels quels', async () => {
    const out = await sanitizeInBrowser(
      '<p dir="rtl" lang="ar-MA">مرحبا بالعالم 😀 &lt;b&gt; é</p>',
    );
    expect(out).toBe('<p dir="rtl" lang="ar-MA">مرحبا بالعالم 😀 &lt;b&gt; é</p>');
  });
});

describe.skipIf(!hasChromium)('sanitizeSlideHtml dans Chromium : contenu légitime', () => {
  test('texte riche : gras, couleurs, tailles, alignement', async () => {
    const html =
      '<p style="text-align:center;font-size:18px"><strong>Gras</strong> <em>it</em> <u>so</u> ' +
      '<span style="color:#ff0000;font-family:\'Microsoft YaHei\';font-size:18pt">Rouge</span></p>';
    const out = await sanitizeInBrowser(html);
    expect(out).toContain('<strong>Gras</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('<u>so</u>');
    expect(out).toContain('text-align: center');
    expect(out).toContain('font-size: 18px');
    expect(out).toContain('color: #ff0000');
    expect(out).toContain("font-family: 'Microsoft YaHei'");
  });

  test('listes ordonnées et non ordonnées imbriquées', async () => {
    const html =
      '<ul style="margin:0;padding-left:24px"><li>a<ol start="3"><li>b</li></ol></li></ul>';
    const out = await sanitizeInBrowser(html);
    expect(out).toContain('<ul style="margin: 0; padding-left: 24px">');
    expect(out).toContain('<ol start="3">');
  });

  test('tableau avec fusions, alignement et couleurs de fond', async () => {
    const html =
      '<table style="border-collapse:collapse"><thead><tr><th colspan="2" style="background-color:#336699;color:#fff">T</th></tr></thead>' +
      '<tbody><tr><td rowspan="2" align="right" valign="middle">1</td><td>2</td></tr><tr><td>3</td></tr></tbody></table>';
    const out = await sanitizeInBrowser(html);
    for (const fragment of [
      '<thead>',
      'colspan="2"',
      'rowspan="2"',
      'align="right"',
      'valign="middle"',
      'background-color: #336699',
      '<tbody>',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  test('RTL : dir, lang, text-align et direction conservés', async () => {
    const out = await sanitizeInBrowser(
      '<div dir="rtl" lang="ar" style="text-align:right;direction:rtl;unicode-bidi:embed"><p>نص</p></div>',
    );
    expect(out).toContain('dir="rtl"');
    expect(out).toContain('lang="ar"');
    expect(out).toContain('text-align: right');
    expect(out).toContain('direction: rtl');
  });

  test('HTML issu de pptxtojson (paragraphes, marges calc, intervalles inline-block)', async () => {
    const html =
      '<div style="padding: 0px;"><p style="margin-left: calc(10px + 5px); text-indent: -10px; line-height: 1.2; text-align: left;">' +
      '<span style="color: rgb(10, 20, 30); font-weight: bold; text-decoration: underline; font-size: 18pt; font-family: Arial;">Titre</span>' +
      '<span style="display:inline-block;width:0.50em"></span></p>' +
      '<div style="position: relative;width: 100%;height: 30px;white-space: nowrap;">x</div></div>';
    const out = await sanitizeInBrowser(html);
    for (const fragment of [
      'margin-left: calc(10px + 5px)',
      'text-indent: -10px',
      'line-height: 1.2',
      'color: rgb(10, 20, 30)',
      'font-weight: bold',
      'text-decoration: underline',
      'display: inline-block',
      'width: 0.50em',
      'position: relative',
      'white-space: nowrap',
      'width: 100%',
    ]) {
      expect(out).toContain(fragment);
    }
  });

  test('images http(s) et data:image conservées, avec texte alternatif', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const out = await sanitizeInBrowser(
      `<img src="https://example.org/a.png" alt="a"><img src="${png}" width="10">`,
    );
    expect(out).toContain('src="https://example.org/a.png"');
    expect(out).toContain(`src="${png}"`);
    expect(out).toContain('alt="a"');
  });

  test('liens mailto et tel conservés', async () => {
    const out = await sanitizeInBrowser(
      '<a href="mailto:a@b.test">m</a><a href="tel:+212600000000">t</a>',
    );
    expect(out).toContain('href="mailto:a@b.test"');
    expect(out).toContain('href="tel:+212600000000"');
  });
});

describe.skipIf(!hasChromium)('profil katex : formules préservées, attaques neutralisées', () => {
  const FORMULAS = [
    'x^2 + \\frac{a}{b}',
    '\\sqrt[3]{x^2+1}',
    '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
    '\\overbrace{a+b+c}^{3}',
    '\\xrightarrow{\\text{réaction}} \\cancel{x}',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
    '\\begin{cases} x & x>0 \\\\ -x & \\text{sinon} \\end{cases}',
    '\\boxed{E=mc^2} \\underline{u} \\widehat{AB}',
  ];

  /** Compare deux fragments : structure, texte et styles canoniques identiques (hors xmlns). */
  async function canonical(html: string): Promise<string> {
    return page.evaluate((h) => {
      const host = document.createElement('div');
      host.innerHTML = h;
      for (const el of Array.from(host.querySelectorAll('*'))) {
        el.removeAttribute('xmlns');
        const style = el.getAttribute('style');
        if (style !== null && el instanceof HTMLElement) el.setAttribute('style', el.style.cssText);
      }
      return host.innerHTML;
    }, html);
  }

  for (const output of ['html', 'htmlAndMathml'] as const) {
    test.each(FORMULAS)(
      `rendu KaTeX (${output}) identique après assainissement : %s`,
      async (latex) => {
        const raw = katex.renderToString(latex, { displayMode: true, output, throwOnError: false });
        const clean = await sanitizeInBrowser(raw, 'katex');
        expect(await canonical(clean)).toBe(await canonical(raw));
        const report = await inspect(clean);
        expect(report.violations).toEqual([]);
      },
    );
  }

  test('le profil texte riche retire svg et math (le HTML KaTeX ne doit pas y passer)', async () => {
    const raw = katex.renderToString('\\sqrt{x}', { output: 'htmlAndMathml' });
    const clean = await sanitizeInBrowser(raw);
    expect(clean).not.toContain('<svg');
    expect(clean).not.toContain('<math');
  });

  const KATEX_ATTACKS: ReadonlyArray<readonly [string, string]> = [
    [
      'gestionnaire sur span',
      '<span class="katex" onclick="window.__xss=1" onmouseover="window.__xss=1">x</span>',
    ],
    [
      'svg foreignObject',
      '<span class="katex"><svg><foreignObject><img src=x onerror=window.__xss=1></foreignObject></svg></span>',
    ],
    ['svg script', '<span class="katex"><svg><script>window.__xss=1</script></svg></span>'],
    [
      'svg lien xlink',
      '<span class="katex"><svg><a xlink:href="javascript:window.__xss=1"><path d="M0 0"/></a></svg></span>',
    ],
    [
      'svg animate',
      '<span class="katex"><svg><path d="M0 0"><animate onbegin="window.__xss=1" attributeName="d" dur="1s"/></path></svg></span>',
    ],
    [
      'svg style',
      '<span class="katex"><svg><style>*{}</style><path d="M0 0" onload="window.__xss=1"/></svg></span>',
    ],
    [
      'svg use',
      '<span class="katex"><svg><use href="data:image/svg+xml,&lt;svg id=a xmlns=http://www.w3.org/2000/svg onload=window.__xss=1/&gt;#a"/></svg></span>',
    ],
    [
      'math annotation-xml',
      '<math><semantics><mrow><mi>x</mi></mrow><annotation-xml encoding="text/html"><img src=x onerror=window.__xss=1></annotation-xml></semantics></math>',
    ],
    [
      'math mglyph',
      '<math><mtext><mglyph><style><img src=x onerror=window.__xss=1></style></mglyph></mtext></math>',
    ],
    ['math mtext HTML', '<math><mtext><img src=x onerror=window.__xss=1></mtext></math>'],
    ['math href', '<math href="javascript:window.__xss=1"><mi>x</mi></math>'],
    ['lien KaTeX trust', '<span class="katex"><a href="javascript:window.__xss=1">x</a></span>'],
    [
      'style span',
      '<span class="katex" style="background:url(javascript:window.__xss=1);position:fixed">x</span>',
    ],
    ['img data', '<span class="katex"><img src=x onerror=window.__xss=1></span>'],
  ];

  test.each(KATEX_ATTACKS)('neutralise : %s', async (_label, payload) => {
    const out = await sanitizeInBrowser(payload, 'katex');
    const report = await inspect(out);
    expect(report.xss).toBeUndefined();
    expect(report.violations).toEqual([]);
    expect(await sanitizeInBrowser(out, 'katex')).toBe(out);
  });
});
