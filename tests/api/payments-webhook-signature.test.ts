import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  WAVE_SIGNATURE_TOLERANCE_SECONDS,
  verifyPaymentWebhookSignature,
} from '@/lib/payments/webhook-signature';

/**
 * Format Wave (https://docs.wave.com/webhook, section « Webhook Security > Signing Secret ») :
 * en-tête `Wave-Signature: t=<horodatage Unix>,v1=<HMAC-SHA256 hexadécimal>`, où le HMAC porte sur
 * la concaténation `horodatage + corps brut`, avec le secret du webhook comme clé.
 */

// Vecteur publié tel quel dans la documentation officielle Wave (exemple, pas un secret réel).
const DOC_SECRET = 'wave_sn_WHS_xz4m6g8rjs9bshxy05xj4khcvjv7j3hcp4fbpvv6met0zdrjvezg';
const DOC_HEADER =
  't=1667920421,v1=53c971695230e9c51b1030d673eee76e70bbcdf8a7c5b8c1d44e0b8b1329647b';
const DOC_BODY =
  '{"id": "AE_ijzo7oGgrlM7", "type": "checkout.session.completed", "data": {"id": "cos-1b01sghpg100j", "amount": "100", "checkout_status": "complete", "client_reference": null, "currency": "XOF", "error_url": "https://example.com/error", "last_payment_error": null, "business_name": "Annas Apiaries", "payment_status": "succeeded", "success_url": "https://example.com/success", "wave_launch_url": "https://pay.wave.com/c/cos-1b01sghpg100j?a=100&c=XOF&m=Annas%20Apiaries", "when_completed": "2022-11-08T15:05:45Z", "when_created": "2022-11-08T15:05:32Z", "when_expires": "2022-11-09T15:05:32Z", "transaction_id": "TCN4Y4ZC3FM"}}';
const DOC_TIME = 1667920421;

// Vecteurs construits à la main (secret de test).
const SECRET = 'secret-de-test';
const BODY = '{"id":"EV_1","type":"checkout.session.completed","data":{"id":"cos-1"}}';
const NOW = 1_700_000_000;
const env: Record<string, string | undefined> = { WAVE_WEBHOOK_SECRET: SECRET };

function sign(secret: string, timestamp: number | string, body: string | Uint8Array): string {
  const hmac = createHmac('sha256', secret).update(String(timestamp), 'utf8');
  return hmac.update(body).digest('hex');
}

function headers(value?: string): Headers {
  return new Headers(value === undefined ? {} : { 'Wave-Signature': value });
}

function waveHeader(timestamp: number, body: string = BODY, secret: string = SECRET): string {
  return `t=${timestamp},v1=${sign(secret, timestamp, body)}`;
}

function verify(h: Headers, body: string | Uint8Array = BODY, e = env, now = NOW): boolean {
  return verifyPaymentWebhookSignature('wave', h, body, e, now);
}

describe('Wave : vecteur officiel de la documentation', () => {
  it('accepte l’exemple publié (secret, en-tête et corps de la doc)', () => {
    expect(
      verifyPaymentWebhookSignature(
        'wave',
        headers(DOC_HEADER),
        DOC_BODY,
        { WAVE_WEBHOOK_SECRET: DOC_SECRET },
        DOC_TIME,
      ),
    ).toBe(true);
  });

  it('refuse le corps re-sérialisé (exemple 2 de la doc : espaces supprimés)', () => {
    const reserialized = JSON.stringify(JSON.parse(DOC_BODY));
    expect(
      verifyPaymentWebhookSignature(
        'wave',
        headers(DOC_HEADER),
        reserialized,
        { WAVE_WEBHOOK_SECRET: DOC_SECRET },
        DOC_TIME,
      ),
    ).toBe(false);
  });

  it('refuse le seul objet data (exemple 3 de la doc)', () => {
    const dataOnly = JSON.stringify(JSON.parse(DOC_BODY).data);
    expect(
      verifyPaymentWebhookSignature(
        'wave',
        headers(DOC_HEADER),
        dataOnly,
        { WAVE_WEBHOOK_SECRET: DOC_SECRET },
        DOC_TIME,
      ),
    ).toBe(false);
  });
});

describe('Wave : signature', () => {
  it('accepte une signature valide', () => {
    expect(verify(headers(waveHeader(NOW)))).toBe(true);
  });

  it('signe le corps en octets UTF-8 (caractères multi-octets, accents, emojis)', () => {
    const body = '{"business_name":"Café Élève \u{1F600} قلم"}';
    expect(verify(headers(waveHeader(NOW, body)), body)).toBe(true);
    expect(verify(headers(waveHeader(NOW, body)), new TextEncoder().encode(body))).toBe(true);
  });

  it('accepte quand une des signatures v1 correspond (rotation de secret)', () => {
    const good = sign(SECRET, NOW, BODY);
    const other = sign('ancien-secret', NOW, BODY);
    expect(verify(headers(`t=${NOW},v1=${other},v1=${good}`))).toBe(true);
    expect(verify(headers(`t=${NOW},v1=${good},v1=${other}`))).toBe(true);
  });

  it('ignore les clés inconnues et les espaces autour des éléments', () => {
    const good = sign(SECRET, NOW, BODY);
    expect(verify(headers(`v0=abc, t=${NOW} , v1=${good} ,x=1`))).toBe(true);
  });

  it('refuse une signature invalide (mauvais secret)', () => {
    expect(verify(headers(waveHeader(NOW, BODY, 'autre-secret')))).toBe(false);
  });

  it('refuse un corps modifié', () => {
    expect(verify(headers(waveHeader(NOW)), BODY + ' ')).toBe(false);
    expect(verify(headers(waveHeader(NOW)), BODY.replace('cos-1', 'cos-2'))).toBe(false);
  });

  it('refuse un horodatage modifié (il fait partie du contenu signé)', () => {
    const good = sign(SECRET, NOW, BODY);
    expect(verify(headers(`t=${NOW + 1},v1=${good}`))).toBe(false);
  });

  it("refuse l'ancien format (HMAC du seul corps, brut ou préfixé)", () => {
    const bodyOnly = createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex');
    expect(verify(headers(bodyOnly))).toBe(false);
    expect(verify(headers(`sha256=${bodyOnly}`))).toBe(false);
    expect(verify(headers(`t=${NOW},v1=${bodyOnly}`))).toBe(false);
  });

  it('refuse une signature absente ou vide', () => {
    expect(verify(headers())).toBe(false);
    expect(verify(headers(''))).toBe(false);
    expect(verify(headers('   '))).toBe(false);
  });

  it('refuse un en-tête mal formé', () => {
    const good = sign(SECRET, NOW, BODY);
    expect(verify(headers('zz'))).toBe(false);
    expect(verify(headers(`v1=${good}`))).toBe(false);
    expect(verify(headers(`t=${NOW}`))).toBe(false);
    expect(verify(headers(`t=,v1=${good}`))).toBe(false);
    expect(verify(headers(`t=abc,v1=${good}`))).toBe(false);
    expect(verify(headers(`t=${NOW}x,v1=${good}`))).toBe(false);
    expect(verify(headers(`t=-${NOW},v1=${good}`))).toBe(false);
  });

  it("refuse une signature de longueur différente ou non hexadécimale (sans lever d'exception)", () => {
    const good = sign(SECRET, NOW, BODY);
    expect(verify(headers(`t=${NOW},v1=${good.slice(0, 62)}`))).toBe(false);
    expect(verify(headers(`t=${NOW},v1=${good}00`))).toBe(false);
    expect(verify(headers(`t=${NOW},v1=${'z'.repeat(64)}`))).toBe(false);
    expect(verify(headers(`t=${NOW},v1=`))).toBe(false);
  });

  it("refuse quand le secret n'est pas configuré (absent ou vide)", () => {
    expect(verify(headers(waveHeader(NOW)), BODY, {})).toBe(false);
    expect(verify(headers(waveHeader(NOW)), BODY, { WAVE_WEBHOOK_SECRET: '' })).toBe(false);
  });

  it('ne confond pas un secret vide avec une signature calculée sur une clé vide', () => {
    const forged = waveHeader(NOW, BODY, '');
    expect(verify(headers(forged), BODY, { WAVE_WEBHOOK_SECRET: '' })).toBe(false);
  });
});

describe('Wave : fenêtre anti-rejeu', () => {
  it('expose la tolérance documentée de 5 minutes', () => {
    expect(WAVE_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });

  it('accepte un horodatage exactement à la limite', () => {
    const past = NOW - WAVE_SIGNATURE_TOLERANCE_SECONDS;
    expect(verify(headers(waveHeader(past)))).toBe(true);
    const future = NOW + WAVE_SIGNATURE_TOLERANCE_SECONDS;
    expect(verify(headers(waveHeader(future)))).toBe(true);
  });

  it('refuse un horodatage trop ancien (rejeu)', () => {
    const old = NOW - WAVE_SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(verify(headers(waveHeader(old)))).toBe(false);
  });

  it('refuse un horodatage trop loin dans le futur', () => {
    const future = NOW + WAVE_SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verify(headers(waveHeader(future)))).toBe(false);
  });

  it("utilise l'horloge système par défaut", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(verifyPaymentWebhookSignature('wave', headers(waveHeader(nowSeconds)), BODY, env)).toBe(
      true,
    );
    expect(
      verifyPaymentWebhookSignature('wave', headers(waveHeader(nowSeconds - 3600)), BODY, env),
    ).toBe(false);
  });
});

describe('autres fournisseurs : refus par défaut', () => {
  it('refuse CinetPay, Orange Money et PayPal même avec un en-tête Wave valide', () => {
    for (const provider of ['cinetpay', 'orange-money', 'paypal'] as const) {
      expect(
        verifyPaymentWebhookSignature(provider, headers(waveHeader(NOW)), BODY, env, NOW),
      ).toBe(false);
    }
  });
});
