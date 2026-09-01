import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  claimInvitation: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: vi.fn(() => ({
    rpc: mocks.rpc,
  })),
}));

async function consume(token = 'invite-token') {
  const { POST } = await import('@/app/api/invitations/consume/route');
  const request = new Request('https://qalem.ma/api/invitations/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/invitations/consume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'recipient-1', email: 'recipient@qalem.ma' } },
    });
    mocks.claimInvitation.mockResolvedValue({
      data: { org_id: 'org-1', role: 'apprenant' },
      error: null,
    });
    mocks.rpc.mockReturnValue({ single: mocks.claimInvitation });
  });

  it('consumes a named invitation only for its email address', async () => {
    const response = await consume();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_invitation_for_existing_user', {
      invitation_token: 'invite-token',
      invited_user_id: 'recipient-1',
      invited_email: 'recipient@qalem.ma',
    });
  });

  it('refuses a named invitation from a different signed-in account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'other-user', email: 'other@qalem.ma' } },
    });

    mocks.claimInvitation.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_QALEM_INVITATION' },
    });

    const response = await consume();

    expect(response.status).toBe(410);
  });

  it('refuses a legacy anonymous invitation', async () => {
    mocks.claimInvitation.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_QALEM_INVITATION' },
    });

    const response = await consume();

    expect(response.status).toBe(410);
  });
});
