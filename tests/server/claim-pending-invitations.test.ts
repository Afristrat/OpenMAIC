import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  pending: { data: [] as Array<{ token: string }> | null, error: null as unknown },
  filters: [] as Array<[string, unknown]>,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceClient,
}));

import { claimPendingInvitations } from '@/lib/server/claim-pending-invitations';

const verifiedUser = {
  id: 'user-1',
  email: 'Invite@Example.com ',
  email_confirmed_at: '2026-09-10T18:49:20Z',
};

describe('claimPendingInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = [];
    mocks.pending = { data: [{ token: 'tok-a' }, { token: 'tok-b' }], error: null };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        mocks.filters.push([column, value]);
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        mocks.filters.push([column, value]);
        return query;
      }),
      gt: vi.fn((column: string) => {
        mocks.filters.push([column, 'future']);
        return Promise.resolve(mocks.pending);
      }),
    };
    mocks.rpc.mockReturnValue({ single: () => Promise.resolve({ data: {}, error: null }) });
    mocks.createServiceClient.mockReturnValue({ from: () => query, rpc: mocks.rpc });
  });

  it('applique chaque invitation en attente pour l’adresse vérifiée, en minuscules', async () => {
    expect(await claimPendingInvitations(verifiedUser)).toBe(2);
    expect(mocks.filters).toContainEqual(['email', 'invite@example.com']);
    expect(mocks.filters).toContainEqual(['used_at', null]);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_invitation_for_existing_user', {
      invitation_token: 'tok-a',
      invited_user_id: 'user-1',
      invited_email: 'invite@example.com',
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('ne fait rien tant que l’adresse du compte n’est pas vérifiée', async () => {
    expect(await claimPendingInvitations({ ...verifiedUser, email_confirmed_at: null })).toBe(0);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('ne fait rien sans adresse', async () => {
    expect(await claimPendingInvitations({ id: 'user-1', email: null })).toBe(0);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('continue avec les autres invitations quand l’une échoue', async () => {
    mocks.rpc
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({ data: null, error: { message: 'INVALID_QALEM_INVITATION' } }),
      })
      .mockReturnValueOnce({ single: () => Promise.resolve({ data: {}, error: null }) });
    expect(await claimPendingInvitations(verifiedUser)).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it('rend 0 quand rien n’est en attente', async () => {
    mocks.pending = { data: [], error: null };
    expect(await claimPendingInvitations(verifiedUser)).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
