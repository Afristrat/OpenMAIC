import type { PresentationBranding } from '@/lib/branding/presentation-branding';
import { createAssetFetcher } from './inline-assets';
import { createProxiedFetch } from './proxied-fetch';

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image de branding illisible'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Snapshot de branding impossible'))), 'image/png');
  });
}

/**
 * Applies the tenant presentation signature to a client-rendered slide
 * snapshot before it is uploaded for MP4 rendering. The authored slide stays
 * untouched; the export image is the sole derived artefact.
 */
export async function addPresentationBrandToSnapshot(
  snapshot: Blob,
  branding: PresentationBranding | undefined,
): Promise<Blob> {
  if (!branding || branding.mode === 'none') return snapshot;

  const showOrganization =
    !!branding.organizationLogoUrl &&
    (branding.mode === 'organization' || branding.mode === 'both');
  const showQalem = branding.mode === 'qalem' || branding.mode === 'both';
  if (!showOrganization && !showQalem) return snapshot;

  try {
    const base = await loadImage(snapshot);
    let organizationLogo: HTMLImageElement | null = null;
    if (showOrganization) {
      const asset = await createAssetFetcher({ fetchImpl: createProxiedFetch() })(
        branding.organizationLogoUrl!,
      );
      if (asset) organizationLogo = await loadImage(new Blob([asset.bytes], { type: asset.contentType }));
    }

    const canvas = document.createElement('canvas');
    canvas.width = base.naturalWidth || 1920;
    canvas.height = base.naturalHeight || 1080;
    const context = canvas.getContext('2d');
    if (!context) return snapshot;
    context.drawImage(base, 0, 0, canvas.width, canvas.height);

    const pad = Math.round(canvas.width * 0.018);
    const markHeight = Math.max(34, Math.round(canvas.height * 0.042));
    const qalamWidth = showQalem ? Math.round(markHeight * 2.1) : 0;
    const orgWidth = organizationLogo ? Math.round(markHeight * 3.5) : 0;
    const gap = organizationLogo && showQalem ? Math.round(markHeight * 0.45) : 0;
    const panelWidth = orgWidth + qalamWidth + gap + pad * 2;
    const x = canvas.width - panelWidth - pad;
    const y = canvas.height - markHeight - pad;

    context.fillStyle = 'rgba(255,255,255,0.88)';
    context.beginPath();
    context.roundRect(x, y, panelWidth, markHeight + pad, Math.round(markHeight * 0.3));
    context.fill();

    let cursor = x + pad;
    if (organizationLogo) {
      const ratio = organizationLogo.naturalWidth / Math.max(organizationLogo.naturalHeight, 1);
      const width = Math.min(orgWidth, markHeight * ratio);
      context.drawImage(organizationLogo, cursor, y + pad / 2, width, markHeight);
      cursor += orgWidth + gap;
    }
    if (showQalem) {
      context.fillStyle = '#6D28D9';
      context.font = `700 ${Math.round(markHeight * 0.62)}px Arial, sans-serif`;
      context.textBaseline = 'middle';
      context.fillText('Qalem', cursor, y + markHeight / 2 + pad / 2);
    }
    return await canvasBlob(canvas);
  } catch {
    // A logo that is temporarily unavailable must never cancel the requested MP4 export.
    return snapshot;
  }
}
