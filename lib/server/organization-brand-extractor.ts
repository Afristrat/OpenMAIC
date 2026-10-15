import sharp from 'sharp';
import { readLimitedBody } from '@/lib/server/read-limited-body';
import { safeFetch, validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { extractBrandFromSources } from '@/lib/branding/brand-extraction';
import type { OrganizationDesignSystem } from '@/lib/branding/organization-design-system';

const CRAWL_TIMEOUT_MS = 30_000;
const STYLESHEET_TIMEOUT_MS = 10_000;
const STYLESHEET_MAX_CHARS = 1_500_000;
const STYLESHEET_MAX_COUNT = 8;
const PAGE_MAX_CHARS = 3_000_000;
const MAX_REDIRECTS = 3;
/** Framework and vendor sheets carry their own palette, never the tenant's. */
const VENDOR_STYLESHEET =
  /bootstrap|fontawesome|font-awesome|animate|swiper|slick|owl\.|normalize|dashicons|wp-includes|magnific|fancybox|\baos\b|jquery/iu;

interface CrawlHtmlResponse {
  html?: string;
}

interface CrawlScreenshotResponse {
  screenshot?: string;
}

function crawlConfig() {
  const baseUrl = process.env.CRAWL4AI_BASE_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Crawl4AI is not configured');
  const token = process.env.CRAWL4AI_API_TOKEN?.trim();
  return {
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

async function crawlJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl, headers } = crawlConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Crawl4AI ${path} returned ${response.status}`);
  return (await response.json()) as T;
}

function absoluteUrl(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value || value.startsWith('data:')) return undefined;
  try {
    return new URL(value, sourceUrl).toString();
  } catch {
    return undefined;
  }
}

function extractLogoUrl(html: string, sourceUrl: string): string | undefined {
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const logoTag = imageTags.find((tag) => /logo|brand|marque/i.test(tag));
  const logoSrc = logoTag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  if (logoSrc) return absoluteUrl(logoSrc, sourceUrl);
  const iconTag = (html.match(/<link\b[^>]*>/gi) ?? []).find((tag) =>
    /rel=["'][^"']*(?:icon|apple-touch-icon)/i.test(tag),
  );
  return absoluteUrl(iconTag?.match(/\bhref=["']([^"']+)["']/i)?.[1], sourceUrl);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function screenshotColors(base64: string): Promise<string[]> {
  const payload = base64.replace(/^data:image\/\w+;base64,/, '');
  const { data, info } = await sharp(Buffer.from(payload, 'base64'))
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  for (let index = 0; index < data.length; index += info.channels) {
    const color = rgbToHex(
      Math.min(255, Math.round(data[index] / 8) * 8),
      Math.min(255, Math.round(data[index + 1] / 8) * 8),
      Math.min(255, Math.round(data[index + 2] / 8) * 8),
    );
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([color]) => color)
    .slice(0, 20);
}

function sameSite(candidate: URL, site: URL): boolean {
  const strip = (host: string) => host.replace(/^www\./u, '');
  const base = strip(site.hostname);
  const host = strip(candidate.hostname);
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Fetches a public page or stylesheet through the SSRF guard: every hop (redirects included) is
 * validated and the connection is pinned to the validated address (no DNS rebinding window).
 */
async function fetchGuarded(
  url: string,
  timeoutMs: number,
  maxChars: number,
): Promise<{ text: string; url: string }> {
  const { response, finalUrl, dispose } = await safeFetch(
    url,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QalemBrandReader/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    },
    { maxRedirects: MAX_REDIRECTS },
  );
  try {
    if (!response.ok) throw new Error(`${finalUrl} returned ${response.status}`);
    // Lecture en flux : une réponse chunked sans fin est coupée au plafond (1 caractère = au moins
    // 1 octet UTF-8) au lieu d'être entièrement chargée en mémoire.
    const { bytes } = await readLimitedBody(
      response.body as ReadableStream<Uint8Array> | null,
      maxChars,
      { onExceed: 'truncate' },
    );
    return { text: new TextDecoder().decode(bytes).slice(0, maxChars), url: finalUrl };
  } finally {
    await dispose();
  }
}

/** The site's own stylesheets, fetched through the same SSRF guard as the page itself. */
async function ownStylesheets(html: string, pageUrl: string): Promise<string[]> {
  const site = new URL(pageUrl);
  const hrefs: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    if (!/rel=["']?stylesheet/iu.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    const url = absoluteUrl(href?.replace(/&amp;/gu, '&'), pageUrl);
    if (!url || VENDOR_STYLESHEET.test(url) || !sameSite(new URL(url), site)) continue;
    if (!hrefs.includes(url)) hrefs.push(url);
  }
  const sheets = await Promise.allSettled(
    hrefs
      .slice(0, STYLESHEET_MAX_COUNT)
      .map(
        async (url) => (await fetchGuarded(url, STYLESHEET_TIMEOUT_MS, STYLESHEET_MAX_CHARS)).text,
      ),
  );
  return sheets.flatMap((sheet) => (sheet.status === 'fulfilled' ? [sheet.value] : []));
}

export async function extractOrganizationDesignSystem(
  sourceUrl: string,
): Promise<OrganizationDesignSystem> {
  const normalizedUrl = new URL(sourceUrl).toString();
  const ssrfError = await validateUrlForSSRF(normalizedUrl);
  if (ssrfError) throw new Error(ssrfError);
  const [htmlResult, screenshotResult] = await Promise.all([
    crawlJson<CrawlHtmlResponse>('/html', { url: normalizedUrl }),
    // The screenshot only helps to find a background the CSS does not declare: never fatal.
    crawlJson<CrawlScreenshotResponse>('/screenshot', {
      url: normalizedUrl,
      screenshot_wait_for: 2,
      wait_for_images: true,
    }).catch((): CrawlScreenshotResponse => ({})),
  ]);
  const html = htmlResult.html ?? '';
  if (!html) throw new Error('Crawl4AI returned no HTML');
  // The crawler answers a cleaned page without <link> or <style>: the design decisions of the
  // site (stylesheets, theme colour, font links) live in its raw markup, read separately.
  const raw = await fetchGuarded(normalizedUrl, CRAWL_TIMEOUT_MS, PAGE_MAX_CHARS).catch(() => null);
  const markup = raw?.text ?? html;
  const [css, renderedColors] = await Promise.all([
    ownStylesheets(markup, raw?.url ?? normalizedUrl),
    screenshotResult.screenshot ? screenshotColors(screenshotResult.screenshot) : [],
  ]);
  const brand = extractBrandFromSources({ html: markup, css, screenshotColors: renderedColors });
  const allCss = [markup, ...css].join('\n');
  const radii = allCss.match(/border-radius\s*:\s*([^;}]+)/gi) ?? [];
  const hasShadows = /box-shadow\s*:/i.test(allCss);
  const hasGrid = /display\s*:\s*grid|grid-template|\bgrid\b/i.test(allCss);
  const inferred = [...brand.inferred];
  if (css.length === 0) inferred.push('Feuilles de style du site illisibles : HTML seul analysé');
  if (radii.length === 0) inferred.push('Corner treatment inferred from rendered composition');
  const accent = brand.palette.find((token) => token.name === 'accent')?.hex;
  const fallbackFont = 'Inter, sans-serif';

  return {
    version: 1,
    sourceUrl: normalizedUrl,
    extractedAt: new Date().toISOString(),
    logoUrl: extractLogoUrl(html, normalizedUrl),
    palette: brand.palette,
    typography: {
      display: brand.fonts.display ?? fallbackFont,
      body: brand.fonts.body ?? brand.fonts.display ?? fallbackFont,
      utility: brand.fonts.utility ?? brand.fonts.body ?? fallbackFont,
    },
    spacingRhythm: /\b(?:gap|padding|margin)-(?:2|4|6|8|10|12)\b/i.test(allCss)
      ? 'regular modular spacing with clear section breaks'
      : 'measured spacing inferred from the rendered page',
    cornerRadius: radii.slice(0, 3).join(', ') || 'restrained rounded corners',
    borderAndShadow: hasShadows
      ? 'subtle borders with selective depth shadows'
      : 'flat surfaces separated by contrast and light borders',
    density: /max-width|container/i.test(allCss) ? 'focused and moderately spacious' : 'balanced',
    layoutLogic: hasGrid
      ? 'responsive grid, strong alignment and one dominant message per section'
      : 'single reading axis with grouped content and generous separation',
    signatureElement: accent
      ? `controlled use of the ${accent} accent for recognition`
      : 'recognition carried by the typography and the paper colour of the site',
    never: [
      'decorative clutter without a learning purpose',
      'low-contrast text',
      'overlapping or clipped content',
      'invented logos or off-brand watermarks',
      'visible color codes or prompt instructions',
    ],
    inferred,
  };
}
