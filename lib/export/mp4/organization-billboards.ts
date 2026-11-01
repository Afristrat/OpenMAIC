import { join } from 'node:path';
import sharp from 'sharp';
import { brandCharterFromSettings } from '@/lib/branding/brand-charter';
import {
  presentationBrandingFromOrganization,
  type PresentationBranding,
} from '@/lib/branding/presentation-branding';
import { createLogger } from '@/lib/logger';
import { safeFetch } from '@/lib/server/ssrf-guard';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  BILLBOARD_SECONDS,
  billboardLanguage,
  billboardPalette,
  buildBillboardSvg,
  planBillboards,
  type BillboardKind,
  type BillboardLanguage,
  type BillboardPalette,
  type BillboardPlan,
} from './billboard-card';

const log = createLogger('OrganizationBillboards');

const LOGO_TIMEOUT_MS = 8_000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface OrganizationBillboardBrand {
  organizationName: string;
  courseTitle: string;
  language: BillboardLanguage;
  branding: PresentationBranding;
  palette: BillboardPalette;
  logoUrl?: string;
}

/** Charge l'identité de l'organisation propriétaire du cours. Retourne null si rien n'est affichable. */
export async function loadOrganizationBillboardBrand(
  stageId: string,
): Promise<OrganizationBillboardBrand | null> {
  const supabase = createServiceSupabaseClient();
  const { data: stage } = await supabase
    .from('stages')
    .select('name, org_id')
    .eq('id', stageId)
    .maybeSingle();
  if (!stage?.org_id) return null;
  const { data: organization } = await supabase
    .from('organizations')
    .select('name, logo, settings, default_locale')
    .eq('id', stage.org_id)
    .maybeSingle();
  if (!organization) return null;

  const settings =
    organization.settings && typeof organization.settings === 'object'
      ? (organization.settings as Record<string, unknown>)
      : {};
  const charter = brandCharterFromSettings(settings);
  return {
    organizationName: String(organization.name ?? ''),
    courseTitle: String(stage.name ?? ''),
    language: billboardLanguage(organization.default_locale),
    branding: presentationBrandingFromOrganization(organization.logo, settings),
    palette: billboardPalette({
      background: charter?.colors.background,
      accent: charter?.colors.accent,
    }),
    ...(organization.logo?.trim() ? { logoUrl: organization.logo.trim() } : {}),
  };
}

/** Télécharge le logo par une connexion protégée (SSRF) et le ramène à un PNG borné, intégrable au carton. */
export async function fetchLogoDataUri(logoUrl: string): Promise<string | undefined> {
  if (logoUrl.startsWith('data:image/')) {
    try {
      // Le texte d'un data URI est borné avant tout décodage : jamais de grosse allocation sur une valeur saisie.
      if (logoUrl.length > LOGO_MAX_BYTES * 2) return undefined;
      const encoded = logoUrl.slice(logoUrl.indexOf(',') + 1);
      const bytes = logoUrl.includes(';base64,')
        ? Buffer.from(encoded, 'base64')
        : Buffer.from(decodeURIComponent(encoded));
      if (bytes.byteLength > LOGO_MAX_BYTES) return undefined;
      return await rasterizeLogo(bytes);
    } catch {
      return undefined;
    }
  }
  let dispose: (() => Promise<void>) | undefined;
  try {
    const result = await safeFetch(logoUrl, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    dispose = result.dispose;
    if (!result.response.ok) return undefined;
    const type = result.response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return undefined;
    const declared = Number(result.response.headers.get('content-length') ?? 0);
    if (declared > LOGO_MAX_BYTES) return undefined;
    const bytes = await readBounded(result.response.body, LOGO_MAX_BYTES);
    if (!bytes) return undefined;
    return await rasterizeLogo(bytes);
  } catch (error) {
    log.warn('Logo d’organisation indisponible pour les cartons vidéo:', error);
    return undefined;
  } finally {
    await dispose?.();
  }
}

/** Lit le corps par morceaux et abandonne dès que la limite est franchie : le fichier n'est jamais mis en mémoire en entier. */
interface ChunkReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

async function readBounded(
  body: { getReader(): ChunkReader } | null,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function rasterizeLogo(bytes: Buffer): Promise<string> {
  // limitInputPixels : une image très petite en octets mais énorme en pixels ne sature pas la mémoire.
  const png = await sharp(bytes, { limitInputPixels: 25_000_000 })
    .resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

type FfmpegRunner = (args: string[]) => Promise<void>;

async function renderBillboardSegment(params: {
  kind: BillboardKind;
  directory: string;
  brand: OrganizationBillboardBrand;
  plan: BillboardPlan;
  logoDataUri?: string;
  runFfmpeg: FfmpegRunner;
}): Promise<string> {
  const imagePath = join(params.directory, `billboard-${params.kind}.png`);
  const segmentPath = join(params.directory, `billboard-${params.kind}.mp4`);
  const svg = buildBillboardSvg({
    kind: params.kind,
    plan: params.plan,
    organizationName: params.brand.organizationName,
    courseTitle: params.brand.courseTitle,
    language: params.brand.language,
    palette: params.brand.palette,
    logoDataUri: params.logoDataUri,
  });
  await sharp(Buffer.from(svg)).png().toFile(imagePath);
  // Mêmes paramètres d'encodage que les scènes : l'assemblage final se fait sans réencodage.
  await params.runFfmpeg([
    '-loop',
    '1',
    '-i',
    imagePath,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t',
    String(BILLBOARD_SECONDS[params.kind]),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-tune',
    'stillimage',
    '-threads',
    process.env.FFMPEG_THREADS || '4',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '25',
    '-shortest',
    '-movflags',
    '+faststart',
    segmentPath,
  ]);
  return segmentPath;
}

/**
 * Carton d'entrée et carton de sortie à l'identité de l'organisation. Un carton qui ne peut pas être
 * produit n'annule jamais l'export demandé : la vidéo sort alors sans carton, et la cause est journalisée.
 */
export async function renderOrganizationBillboards(params: {
  directory: string;
  brand: OrganizationBillboardBrand | null;
  runFfmpeg: FfmpegRunner;
}): Promise<{ entry?: string; exit?: string }> {
  const { brand } = params;
  if (!brand) return {};
  const plan = planBillboards(brand.branding);
  if (!plan) return {};
  try {
    const logoDataUri =
      plan.showOrganization && brand.logoUrl ? await fetchLogoDataUri(brand.logoUrl) : undefined;
    const shared = {
      directory: params.directory,
      brand,
      plan,
      logoDataUri,
      runFfmpeg: params.runFfmpeg,
    };
    return {
      entry: await renderBillboardSegment({ ...shared, kind: 'entry' }),
      exit: await renderBillboardSegment({ ...shared, kind: 'exit' }),
    };
  } catch (error) {
    log.warn('Cartons d’entrée et de sortie non produits, export poursuivi sans eux:', error);
    return {};
  }
}
