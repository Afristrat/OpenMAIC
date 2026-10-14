import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/payments/webhook/route';
import { waveAdapter } from '@/lib/payments/providers/wave';

const SECRET = 'secret-de-test-route';

// Événement Wave tel que décrit par https://docs.wave.com/webhook (« Event Types »).
const EVENT = JSON.stringify({
  id: 'EV_QvEZuDSQbLdI',
  type: 'checkout.session.completed',
  data: {
    id: 'cos-18qq25rgr100a',
    amount: '1000',
    currency: 'XOF',
    payment_status: 'succeeded',
    checkout_status: 'complete',
    client_reference: 'order-123',
    transaction_id: 'TCN4Y4ZC3FM',
    when_completed: '2021-12-08T10:15:32Z',
  },
});

function signedHeader(body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', SECRET).update(`${timestamp}${body}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function request(provider: string, body: string, signature?: string): NextRequest {
  return new NextRequest(`http://localhost/api/payments/webhook?provider=${provider}`, {
    method: 'POST',
    headers: signature ? { 'Wave-Signature': signature } : {},
    body,
  });
}

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    vi.stubEnv('WAVE_WEBHOOK_SECRET', SECRET);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('répond 400 pour un fournisseur inconnu', async () => {
    const res = await POST(request('inconnu', EVENT));
    expect(res.status).toBe(400);
  });

  it('répond 403 sans signature', async () => {
    const res = await POST(request('wave', EVENT));
    expect(res.status).toBe(403);
  });

  it('répond 403 pour une signature calculée sur un autre corps', async () => {
    const res = await POST(request('wave', EVENT, signedHeader(EVENT + ' ')));
    expect(res.status).toBe(403);
  });

  it('répond 403 pour un horodatage trop ancien', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await POST(request('wave', EVENT, signedHeader(EVENT, old)));
    expect(res.status).toBe(403);
  });

  it('répond 403 pour CinetPay, Orange Money et PayPal (refus par défaut)', async () => {
    for (const provider of ['cinetpay', 'orange-money', 'paypal']) {
      const res = await POST(request(provider, EVENT, signedHeader(EVENT)));
      expect(res.status).toBe(403);
    }
  });

  it('accepte un événement Wave signé et en déduit le statut complété', async () => {
    const res = await POST(request('wave', EVENT, signedHeader(EVENT)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, status: 'completed' });
  });
});

describe('waveAdapter.handleWebhook (enveloppe d’événement Wave)', () => {
  it('lit la session de paiement dans `data` et non à la racine', async () => {
    const result = await waveAdapter.handleWebhook(JSON.parse(EVENT));
    expect(result.status).toBe('completed');
    expect(result.transactionId).toBe('cos-18qq25rgr100a');
    expect(result.amount).toBe(1000);
    expect(result.currency).toBe('XOF');
  });

  it('laisse en attente un échec de tentative (plusieurs échecs possibles avant succès)', async () => {
    const failed = {
      id: 'EV_8bO0d7TwW6Eq',
      type: 'checkout.session.payment_failed',
      data: {
        id: 'cos-18qq25rgr100a',
        payment_status: 'failed',
        checkout_status: 'failed',
        last_payment_error: { code: 'insufficient-funds', message: 'Insufficient balance' },
      },
    };
    const result = await waveAdapter.handleWebhook(failed);
    expect(result.status).toBe('pending');
  });

  it("ne rattache aucune transaction à un événement qui n'est pas une session de paiement", async () => {
    const result = await waveAdapter.handleWebhook({
      id: 'AE_x',
      type: 'test.test_event',
      data: {},
    });
    expect(result.transactionId).toBe('');
    expect(result.status).toBe('pending');
  });

  it('refuse une charge utile sans objet `data`', async () => {
    await expect(
      waveAdapter.handleWebhook({ id: 'x', type: 'checkout.session.completed' }),
    ).rejects.toThrow();
  });
});
