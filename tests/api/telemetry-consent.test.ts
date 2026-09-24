import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  read: vi.fn(),
  readXapi: vi.fn(),
  writeXapi: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/telemetry/pedagogy-collector', () => ({
  readConsentState: mocks.read,
  readXapiConsent: mocks.readXapi,
  setXapiConsent: mocks.writeXapi,
}));
import { GET, POST } from '@/app/api/telemetry-consent/route';

function request(body?: unknown, origin = 'http://localhost') {
  return new NextRequest(
    'http://localhost/api/telemetry-consent',
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin },
          body: JSON.stringify(body),
        },
  );
}

describe('learning analytics and xAPI boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.auth.mockResolvedValue({ user: { id: 'session-user' } });
    mocks.read.mockResolvedValue({ choice: true, epoch: null });
    mocks.readXapi.mockResolvedValue(false);
    mocks.writeXapi.mockResolvedValue(undefined);
  });

  it('keeps the external xAPI choice separate from internal analytics', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/telemetry-consent?purpose=xapi'),
    );
    expect(await response.json()).toEqual({ choice: false, hasConsent: false });
    expect(mocks.read).not.toHaveBeenCalled();
    expect((await POST(request({ consent: true, purpose: 'xapi' }))).status).toBe(200);
    expect(mocks.writeXapi).toHaveBeenCalledWith('session-user', true);
  });

  it.each([GET, POST])('requires a verified session', async (handler) => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await handler(request({ consent: true, purpose: 'xapi' }))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.writeXapi).not.toHaveBeenCalled();
  });

  it('returns the contractual analytics state without exposing a write control', async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ choice: true, epoch: null, hasConsent: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.read).toHaveBeenCalledWith('session-user');
    expect((await POST(request({ consent: false }))).status).toBe(400);
    expect(mocks.writeXapi).not.toHaveBeenCalled();
  });

  it('refuses reading another account', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/telemetry-consent?userId=other'),
    );
    expect(response.status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('rejects client-supplied identity', async () => {
    expect(
      (await POST(request({ consent: true, purpose: 'xapi', userId: 'other' }))).status,
    ).toBe(400);
    expect(mocks.writeXapi).not.toHaveBeenCalled();
  });

  it('does not report a failed xAPI write as success', async () => {
    mocks.writeXapi.mockRejectedValue(new Error('private database detail'));
    const response = await POST(request({ consent: false, purpose: 'xapi' }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });

  it('does not report a failed analytics read as refusal', async () => {
    mocks.read.mockRejectedValue(new Error('unavailable'));
    expect((await GET(request())).status).toBe(503);
  });

  it('rejects a foreign origin', async () => {
    expect(
      (await POST(request({ consent: true, purpose: 'xapi' }, 'https://foreign.test'))).status,
    ).toBe(403);
    expect(mocks.writeXapi).not.toHaveBeenCalled();
  });

  it('bounds bodies without relying on Content-Length', async () => {
    expect((await POST(request({ padding: 'x'.repeat(1025) }))).status).toBe(413);
    expect(mocks.writeXapi).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/telemetry-consent', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(response.status).toBe(400);
  });
});
