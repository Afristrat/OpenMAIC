import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/telemetry/pedagogy-collector', () => ({
  readConsent: mocks.read,
  setConsent: mocks.write,
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

describe('consent identity and persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.auth.mockResolvedValue({ user: { id: 'session-user' } });
    mocks.read.mockResolvedValue(null);
    mocks.write.mockResolvedValue(undefined);
  });
  it.each([GET, POST])('requires a verified session', async (handler) => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await handler(request({ consent: true }))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([null, false, true])('distinguishes stored choice %s', async (choice) => {
    mocks.read.mockResolvedValue(choice);
    const response = await GET(request());
    expect(await response.json()).toEqual({ choice, hasConsent: choice === true });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.read).toHaveBeenCalledWith('session-user');
  });
  it('refuses reading another account', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/telemetry-consent?userId=other'),
    );
    expect(response.status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects client-supplied identity', async () => {
    expect((await POST(request({ consent: true, userId: 'other' }))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([true, false])('persists %s for the session user', async (consent) => {
    const response = await POST(request({ consent }));
    expect(await response.json()).toEqual({ ok: true, choice: consent });
    expect(mocks.write).toHaveBeenCalledWith('session-user', consent);
  });
  it('does not report a failed write as success', async () => {
    mocks.write.mockRejectedValue(new Error('private database detail'));
    const response = await POST(request({ consent: false }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
  });
  it('does not report a failed read as refusal', async () => {
    mocks.read.mockRejectedValue(new Error('unavailable'));
    expect((await GET(request())).status).toBe(503);
  });
  it('rejects a foreign origin', async () => {
    expect((await POST(request({ consent: true }, 'https://foreign.test'))).status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('bounds bodies without relying on Content-Length', async () => {
    expect((await POST(request({ padding: 'x'.repeat(1025) }))).status).toBe(413);
    expect(mocks.write).not.toHaveBeenCalled();
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
