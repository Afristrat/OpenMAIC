import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from './types';

/**
 * Vérification de signature des webhooks de paiement (refus par défaut).
 *
 * - Wave : stratégie « Signing Secret » de https://docs.wave.com/webhook (section « Webhook Security »).
 *   En-tête `Wave-Signature: t=<horodatage Unix>,v1=<HMAC-SHA256 hexadécimal>` (plusieurs `v1`
 *   possibles pendant une rotation de secret). Le HMAC est calculé avec le secret du webhook
 *   (`WAVE_WEBHOOK_SECRET`) sur la concaténation `horodatage + corps brut`. La documentation
 *   demande de rejeter les requêtes de plus de 5 minutes (anti-rejeu).
 *   La stratégie « Shared Secret » (jeton Bearer) est volontairement refusée : Wave la qualifie
 *   de moins sûre (le secret circule dans chaque requête).
 * - CinetPay, Orange Money, PayPal : aucun format de signature vérifiable à ce jour ; refusés
 *   tant qu'une vérification dédiée n'est pas ajoutée. Motifs : CinetPay, documentation officielle
 *   injoignable (docs.cinetpay.com ne résout pas) ; Orange Money, documentation inaccessible sans
 *   compte développeur (HTTP 403) ; PayPal, signature RSA avec certificat téléchargé
 *   (`paypal-cert-url`) ou vérification par appel API, ce qui exige une étape asynchrone dédiée.
 */

/** Fenêtre anti-rejeu en secondes. Wave documente 5 minutes dans le passé ; la même borne est
 *  appliquée dans le futur pour absorber un décalage d'horloge (non documenté pour les webhooks). */
export const WAVE_SIGNATURE_TOLERANCE_SECONDS = 300;

const WAVE_SIGNATURE_HEADER = 'wave-signature';
const WAVE_SECRET_ENV = 'WAVE_WEBHOOK_SECRET';
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const UNIX_SECONDS = /^[0-9]{1,12}$/;

type RawBody = string | Uint8Array;

function waveSignedPayload(timestamp: string, rawBody: RawBody): Buffer {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody);
  return Buffer.concat([Buffer.from(timestamp, 'utf8'), body]);
}

type ParsedWaveSignature = { timestamp: string; signatures: string[] };

function parseWaveSignature(header: string): ParsedWaveSignature | null {
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const element of header.split(',')) {
    const separator = element.indexOf('=');
    if (separator < 0) continue;
    const key = element.slice(0, separator).trim();
    const value = element.slice(separator + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (timestamp === null || !UNIX_SECONDS.test(timestamp)) return null;
  return { timestamp, signatures: signatures.filter((s) => HEX_SHA256.test(s)) };
}

function verifyWave(
  headers: Headers,
  rawBody: RawBody,
  env: Record<string, string | undefined>,
  nowSeconds: number,
): boolean {
  const secret = env[WAVE_SECRET_ENV];
  const header = headers.get(WAVE_SIGNATURE_HEADER);
  if (!secret || !header) return false;

  const parsed = parseWaveSignature(header);
  if (!parsed || parsed.signatures.length === 0) return false;

  if (Math.abs(nowSeconds - Number(parsed.timestamp)) > WAVE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(waveSignedPayload(parsed.timestamp, rawBody))
    .digest();

  // Pas de court-circuit : toutes les signatures sont comparées en temps constant.
  let matched = false;
  for (const signature of parsed.signatures) {
    if (timingSafeEqual(Buffer.from(signature, 'hex'), expected)) matched = true;
  }
  return matched;
}

export function verifyPaymentWebhookSignature(
  provider: PaymentProvider,
  headers: Headers,
  rawBody: RawBody,
  env: Record<string, string | undefined> = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (provider === 'wave') return verifyWave(headers, rawBody, env, nowSeconds);
  return false;
}
