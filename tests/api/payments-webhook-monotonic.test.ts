import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  handlePaymentWebhook: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
}));

vi.mock('@/lib/payments', () => ({ handlePaymentWebhook: mocks.handlePaymentWebhook }));
vi.mock('@/lib/payments/webhook-signature', () => ({ verifyPaymentWebhookSignature: () => true }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: (values: Record<string, unknown>) => {
        mocks.update(values);
        const chain = {
          eq: (column: string, value: string) => {
            mocks.eq(column, value);
            return chain;
          },
          not: (column: string, operator: string, value: string) => {
            mocks.not(column, operator, value);
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from '@/app/api/payments/webhook/route';

function deliver(status: string) {
  mocks.handlePaymentWebhook.mockResolvedValue({ transactionId: 'TX-1', status });
  return POST(
    new NextRequest('http://localhost/api/payments/webhook?provider=wave', {
      method: 'POST',
      body: '{}',
    }),
  );
}

describe('POST /api/payments/webhook : statut monotone', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
    mocks.handlePaymentWebhook.mockReset();
    mocks.update.mockReset();
    mocks.eq.mockReset();
    mocks.not.mockReset();
  });

  it.each([
    ['pending', '(failed,completed,refunded)'],
    ['failed', '(completed,refunded)'],
    ['completed', '(refunded)'],
  ])('un événement %s ne remplace jamais un statut plus avancé', async (status, protectedList) => {
    const response = await deliver(status);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status }));
    expect(mocks.eq).toHaveBeenCalledWith('transaction_id', 'TX-1');
    expect(mocks.not).toHaveBeenCalledWith('status', 'in', protectedList);
  });

  it('un remboursement s’applique depuis tout statut', async () => {
    const response = await deliver('refunded');
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'refunded' }));
    expect(mocks.not).not.toHaveBeenCalled();
  });
});
