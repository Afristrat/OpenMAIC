import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  invitation: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.invitation }) }),
    }),
    auth: { admin: { createUser: mocks.createUser } },
  }),
}));

async function signup(overrides: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/invitations/signup/route');
  const request = new Request('https://qalem.ma/api/invitations/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'named-invite',
      email: 'recipient@qalem.ma',
      password: 'correct-password',
      ...overrides,
    }),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/invitations/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invitation.mockResolvedValue({
      data: {
        email: 'recipient@qalem.ma',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
      },
      error: null,
    });
    mocks.createUser.mockResolvedValue({ data: { user: { id: 'recipient-1' } }, error: null });
  });

  it('creates a confirmed user carrying only the validated invitation token', async () => {
    const response = await signup({ email: 'Recipient@Qalem.ma' });

    expect(response.status).toBe(201);
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: 'recipient@qalem.ma',
      password: 'correct-password',
      email_confirm: true,
      app_metadata: { qalem_invitation_token: 'named-invite' },
    });
  });

  it('refuses a token presented for another email before creating a user', async () => {
    const response = await signup({ email: 'attacker@qalem.ma' });

    expect(response.status).toBe(403);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it('directs an existing invited account to sign in', async () => {
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    });

    const response = await signup();

    expect(response.status).toBe(409);
  });
});
