import { Byte, Encoder } from '@nuintun/qrcode';

const QUIET_ZONE_MODULES = 4;

/**
 * QR code généré localement, sous forme d'URI de données SVG (ASCII, donc `btoa` suffit, côté
 * navigateur comme côté serveur). Remplace l'appel à api.qrserver.com, qui transmettait à un tiers
 * l'URL de vérification, donc le code de vérification de chaque certificat.
 */
export function renderQrSvgDataUri(text: string): string {
  const qr = new Encoder({ level: 'M' }).encode(new Byte(text));
  const total = qr.size + QUIET_ZONE_MODULES * 2;

  let path = '';
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.get(x, y) === 1) {
        path += `M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`;
      }
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
