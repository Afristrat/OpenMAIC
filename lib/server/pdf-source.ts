import type { PdfImage, PdfSourceContent } from '@/lib/types/generation';
import type { ResearchSource } from '@openmaic/dsl';
import { uploadClassroomMedia } from '@/lib/server/classroom-media-generation';

const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

export function normalizePdfImages(source: PdfSourceContent | undefined): PdfImage[] {
  return (source?.images ?? []).map((image, index) =>
    typeof image === 'string' ? { id: `img_${index + 1}`, src: image, pageNumber: 0 } : image,
  );
}

export function uploadedPdfSource(
  source: PdfSourceContent | undefined,
): ResearchSource | undefined {
  if (!source) return undefined;
  return {
    kind: 'uploaded',
    title: source.name?.trim() || 'Document fourni par l’auteur',
    excerpt: `Document fourni par l’auteur : ${source.text.length.toLocaleString('fr-FR')} caractères extraits et ${source.images.length.toLocaleString('fr-FR')} illustration(s).`,
  };
}

export async function persistSelectedPdfImages(
  classroomId: string,
  images: readonly PdfImage[],
  selectedIds: ReadonlySet<string>,
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  for (const image of images) {
    if (!selectedIds.has(image.id)) continue;
    const match = image.src.match(DATA_IMAGE_PATTERN);
    if (!match) throw new Error(`Unsupported extracted image payload: ${image.id}`);
    const extension = match[1].toLowerCase() === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    const subPath = `media/source-${image.id}.${extension}`;
    await uploadClassroomMedia(classroomId, subPath, Buffer.from(match[2], 'base64'));
    mapping[image.id] = `/api/classroom-media/${classroomId}/${subPath}`;
  }
  return mapping;
}
