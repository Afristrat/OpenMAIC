import sharp from 'sharp';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import type {
  BrandColorToken,
  OrganizationDesignSystem,
} from '@/lib/branding/organization-design-system';

const CRAWL_TIMEOUT_MS = 30_000;
const HEX = /^#[0-9a-f]{6}$/i;

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

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function saturation(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return Math.max(...channels) - Math.min(...channels);
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
      Math.min(255, Math.round(data[index] / 24) * 24),
      Math.min(255, Math.round(data[index + 1] / 24) * 24),
      Math.min(255, Math.round(data[index + 2] / 24) * 24),
    );
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([color]) => color)
    .slice(0, 20);
}

function htmlColors(html: string): string[] {
  const counts = new Map<string, number>();
  for (const match of html.match(/#[0-9a-f]{6}\b/gi) ?? []) {
    const color = match.toLowerCase();
    if (!HEX.test(color)) continue;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([color]) => color)
    .slice(0, 20);
}

function selectPalette(colors: string[]): BrandColorToken[] {
  const unique = [...new Set(colors.filter((color) => HEX.test(color)))];
  const fallback = ['#f8fafc', '#ffffff', '#111827', '#4f46e5', '#64748b', '#0ea5e9'];
  for (const color of fallback) if (!unique.includes(color)) unique.push(color);
  const background = [...unique].sort((a, b) => luminance(b) - luminance(a))[0];
  const ink = [...unique].sort((a, b) => luminance(a) - luminance(b))[0];
  const accent = [...unique]
    .filter((color) => color !== background && color !== ink)
    .sort((a, b) => saturation(b) - saturation(a))[0];
  const remaining = unique.filter((color) => ![background, ink, accent].includes(color));
  const surface = remaining[0] ?? fallback[1];
  const secondary = remaining.sort((a, b) => saturation(b) - saturation(a))[0] ?? fallback[5];
  const muted = remaining.sort((a, b) => saturation(a) - saturation(b))[0] ?? fallback[4];
  return [
    { name: 'background', hex: background, purpose: 'page background and breathing room' },
    { name: 'surface', hex: surface, purpose: 'cards and content surfaces' },
    { name: 'ink', hex: ink, purpose: 'high-contrast text and structure' },
    { name: 'accent', hex: accent, purpose: 'primary emphasis and calls to action' },
    { name: 'muted', hex: muted, purpose: 'secondary information' },
    { name: 'secondary', hex: secondary, purpose: 'supporting emphasis' },
  ];
}

function extractFontFamilies(html: string): string[] {
  return [
    ...new Set(
      (html.match(/font-family\s*:\s*([^;}]+)/gi) ?? []).map((entry) =>
        entry
          .replace(/^font-family\s*:\s*/i, '')
          .replace(/["']/g, '')
          .trim(),
      ),
    ),
  ].filter(Boolean);
}

export async function extractOrganizationDesignSystem(
  sourceUrl: string,
): Promise<OrganizationDesignSystem> {
  const normalizedUrl = new URL(sourceUrl).toString();
  const ssrfError = await validateUrlForSSRF(normalizedUrl);
  if (ssrfError) throw new Error(ssrfError);
  const [htmlResult, screenshotResult] = await Promise.all([
    crawlJson<CrawlHtmlResponse>('/html', { url: normalizedUrl }),
    crawlJson<CrawlScreenshotResponse>('/screenshot', {
      url: normalizedUrl,
      screenshot_wait_for: 2,
      wait_for_images: true,
    }),
  ]);
  const html = htmlResult.html ?? '';
  if (!html) throw new Error('Crawl4AI returned no HTML');
  const renderedColors = screenshotResult.screenshot
    ? await screenshotColors(screenshotResult.screenshot)
    : [];
  const fonts = extractFontFamilies(html);
  const radii = html.match(/border-radius\s*:\s*([^;}]+)/gi) ?? [];
  const hasShadows = /box-shadow\s*:/i.test(html);
  const hasGrid = /display\s*:\s*grid|grid-template|\bgrid\b/i.test(html);
  const inferred: string[] = [];
  if (fonts.length === 0) inferred.push('Typography inferred from generic web defaults');
  if (radii.length === 0) inferred.push('Corner treatment inferred from rendered composition');

  return {
    version: 1,
    sourceUrl: normalizedUrl,
    extractedAt: new Date().toISOString(),
    logoUrl: extractLogoUrl(html, normalizedUrl),
    palette: selectPalette([...renderedColors, ...htmlColors(html)]),
    typography: {
      display: fonts[0] ?? 'Inter, sans-serif',
      body: fonts[1] ?? fonts[0] ?? 'Inter, sans-serif',
      utility: fonts[2] ?? fonts[0] ?? 'Inter, sans-serif',
    },
    spacingRhythm: /\b(?:gap|padding|margin)-(?:2|4|6|8|10|12)\b/i.test(html)
      ? 'regular modular spacing with clear section breaks'
      : 'measured spacing inferred from the rendered page',
    cornerRadius: radii.slice(0, 3).join(', ') || 'restrained rounded corners',
    borderAndShadow: hasShadows
      ? 'subtle borders with selective depth shadows'
      : 'flat surfaces separated by contrast and light borders',
    density: /max-width|container/i.test(html) ? 'focused and moderately spacious' : 'balanced',
    layoutLogic: hasGrid
      ? 'responsive grid, strong alignment and one dominant message per section'
      : 'single reading axis with grouped content and generous separation',
    signatureElement: `controlled use of the ${selectPalette([...renderedColors, ...htmlColors(html)])[3].hex} accent for recognition`,
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
