import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeWhatsAppNumber } from '@/lib/notifications/whatsapp-number';
import {
  ReviewNotificationProviderError,
  sendReviewEmail,
  sendReviewWhatsApp,
} from '@/lib/server/review-notifications';

describe('review notification providers', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qalem.ma');
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('SMTP_FROM', 'Qalem <notifications@qalem.ma>');
    vi.stubEnv('EVOLUTION_API_URL', 'https://evolution.example');
    vi.stubEnv('EVOLUTION_API_KEY', 'evolution-test-key');
    vi.stubEnv('EVOLUTION_INSTANCE_NAME', 'qalem reminders');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('normalizes only unambiguous international WhatsApp numbers', () => {
    expect(normalizeWhatsAppNumber('+212 600-000-000')).toBe('+212600000000');
    expect(normalizeWhatsAppNumber('0600000000')).toBeNull();
    expect(normalizeWhatsAppNumber('+012345678')).toBeNull();
  });

  it('sends one idempotent Resend email without exposing configuration in the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email-message-id' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendReviewEmail({
        deliveryId: 'delivery-a',
        recipient: 'learner@example.com',
        locale: 'fr-FR',
        dueCount: 3,
        targetUrl: 'https://qalem.ma/review?card=card-a',
      }),
    ).resolves.toBe('email-message-id');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer resend-test-key',
      'Idempotency-Key': 'qalem-review/delivery-a',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: ['learner@example.com'],
      subject: 'Vos révisions Qalem vous attendent',
    });
  });

  it('uses the Evolution API v2 sendText contract and strips the leading plus sign', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ key: { id: 'whatsapp-message-id' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendReviewWhatsApp({
        deliveryId: 'delivery-b',
        recipient: '+212600000000',
        locale: 'ar-MA',
        dueCount: 2,
        targetUrl: 'https://qalem.ma/review?card=card-b',
      }),
    ).resolves.toBe('whatsapp-message-id');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://evolution.example/message/sendText/qalem%20reminders');
    expect(init.headers).toMatchObject({ apikey: 'evolution-test-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({ number: '212600000000' });
  });

  it('returns a bounded error code instead of an upstream response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(
      sendReviewWhatsApp({
        deliveryId: 'delivery-c',
        recipient: '+212600000000',
        locale: 'en-US',
        dueCount: 1,
        targetUrl: 'https://qalem.ma/review',
      }),
    ).rejects.toEqual(new ReviewNotificationProviderError('EVOLUTION_HTTP_503'));
  });
});
