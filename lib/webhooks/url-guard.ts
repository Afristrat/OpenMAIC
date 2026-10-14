import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

/**
 * Valide l'URL d'un webhook sortant : https obligatoire en production, puis garde SSRF
 * (adresses privées, résolution DNS). Renvoie `null` si l'URL est sûre, sinon le motif du refus.
 * Appelée à la création de la configuration ET juste avant chaque livraison (la résolution
 * DNS peut changer entre les deux).
 */
export async function validateWebhookUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL';
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    return 'Webhook URLs must use HTTPS in production';
  }
  return validateUrlForSSRF(url);
}
