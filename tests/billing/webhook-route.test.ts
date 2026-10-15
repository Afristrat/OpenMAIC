import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ handleStripeWebhook: vi.fn(), logError: vi.fn() }));

vi.mock('@/lib/billing/stripe', () => ({ handleStripeWebhook: mocks.handleStripeWebhook }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.logError,
    debug: vi.fn(),
  }),
}));

import { POST } from '@/app/api/billing/webhook/route';

function req(headers: Record<string, string> = { 'stripe-signature': 't=1,v1=abc' }) {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers,
    body: '{"id":"evt_1"}',
  }) as unknown as NextRequest;
}

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    mocks.handleStripeWebhook.mockReset();
    mocks.logError.mockReset();
  });

  it('accepte un événement valide', async () => {
    mocks.handleStripeWebhook.mockResolvedValue(undefined);
    const response = await POST(req());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it('refuse sans en-tête de signature', async () => {
    const response = await POST(req({}));
    expect(response.status).toBe(400);
  });

  it('renvoie un message générique (jamais celui de Stripe ou de la base) et journalise la cause', async () => {
    mocks.handleStripeWebhook.mockRejectedValue(
      new Error('No signatures found matching the expected signature for payload (whsec_live_abc)'),
    );
    const response = await POST(req());
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain('whsec');
    expect(text).not.toContain('signatures found');
    expect(JSON.parse(text)).toEqual({ error: 'Webhook processing error' });
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logError.mock.calls[0])).toContain('No signatures found');
  });
});
