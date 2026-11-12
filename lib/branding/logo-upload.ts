import sharp from 'sharp';
import { isAcceptedLogoType } from '@/lib/branding/logo-formats';

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

/** Plus grand côté du PNG tiré d'un SVG : net sur tout usage (carton vidéo 1200 px, diapositive, lecteur). */
const SVG_RASTER_SIZE = 2048;
/** Plafond de pixels : un SVG minuscule en octets mais géant en dimensions ne sature pas la mémoire. */
const SVG_MAX_PIXELS = 25_000_000;
/** Une déclaration DOCTYPE ou ENTITY n'a rien à faire dans un logo : entités externes et explosion d'entités. */
const SVG_FORBIDDEN_DECLARATION = /<!\s*(DOCTYPE|ENTITY)/i;

export interface PreparedLogo {
  bytes: ArrayBuffer;
  contentType: string;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * Prépare un logo téléversé pour le stockage. Un SVG servi depuis notre domaine
 * pourrait porter du script : il est donc converti ici en PNG haute définition,
 * et seul ce PNG est stocké, donc tout consommateur (lecteur, PPTX, MP4) reçoit
 * une image matricielle sûre. Renvoie null si le fichier est refusé (type non
 * pris en charge, SVG illisible, déclaration interdite, dimensions démesurées).
 */
export async function prepareLogoUpload(file: File): Promise<PreparedLogo | null> {
  if (!isAcceptedLogoType(file.type)) return null;
  if (file.type !== 'image/svg+xml') {
    return { bytes: await file.arrayBuffer(), contentType: file.type };
  }
  const text = await file.text();
  if (SVG_FORBIDDEN_DECLARATION.test(text)) return null;
  try {
    const png = await sharp(Buffer.from(text), { limitInputPixels: SVG_MAX_PIXELS })
      .resize({ width: SVG_RASTER_SIZE, height: SVG_RASTER_SIZE, fit: 'inside' })
      .png()
      .toBuffer();
    return { bytes: toArrayBuffer(png), contentType: 'image/png' };
  } catch {
    return null;
  }
}
