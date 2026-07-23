import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  invitation: vi.fn(),
  existingMember: vi.fn(),
  insertMember: vi.fn(),
  markInvitationUsed: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === 'org_invitations') {
        return {
          select: () => ({ eq: () => ({ single: () => mocks.invitation() }) }),
          update: () => ({ eq: () => mocks.markInvitationUsed() }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ single: () => mocks.existingMember() }) }),
        }),
        insert: () => mocks.insertMember(),
      };
    },
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
    mocks.invitation.mockResolvedValue({
      data: {
        id: 'invite-1',
        org_id: 'org-1',
        role: 'apprenant',
        email: 'recipient@qalem.ma',
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
      },
      error: null,
    });
    mocks.existingMember.mockResolvedValue({ data: null, error: null });
    mocks.insertMember.mockResolvedValue({ error: null });
    mocks.markInvitationUsed.mockResolvedValue({ error: null });
  });

  it('consumes a named invitation only for its email address', async () => {
    const response = await consume();

    expect(response.status).toBe(200);
    expect(mocks.insertMember).toHaveBeenCalledWith({
      org_id: 'org-1',
      user_id: 'recipient-1',
      role: 'apprenant',
    });
    expect(mocks.markInvitationUsed).toHaveBeenCalledWith(
      expect.objectContaining({ used_at: expect.any(String) }),
    );
  });

  it('refuses a named invitation from a different signed-in account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'other-user', email: 'other@qalem.ma' } },
    });

    const response = await consume();

    expect(response.status).toBe(403);
    expect(mocks.existingMember).not.toHaveBeenCalled();
    expect(mocks.insertMember).not.toHaveBeenCalled();
    expect(mocks.markInvitationUsed).not.toHaveBeenCalled();
  });

  it('keeps a deliberately anonymous invitation usable by any signed-in account', async () => {
    mocks.invitation.mockResolvedValue({
      data: {
        id: 'invite-1',
        org_id: 'org-1',
        role: 'apprenant',
        email: null,
        expires_at: '2099-01-01T00:00:00.000Z',
        used_at: null,
      },
      error: null,
    });

    const response = await consume();

    expect(response.status).toBe(200);
    expect(mocks.insertMember).toHaveBeenCalledOnce();
  });
});
