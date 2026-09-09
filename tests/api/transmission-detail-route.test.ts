import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ read: vi.fn(), profile: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mocks.user },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }) }),
  }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: (id: string, value: string) => {
          mocks.profile(id, value);
          return { maybeSingle: async () => ({ data: { nickname: 'Amina' }, error: null }) };
        },
      }),
    }),
  }),
}));
import { GET } from '@/app/api/transmissions/[id]/route';
const request = () =>
  GET(new NextRequest('http://localhost/api/transmissions/test'), {
    params: Promise.resolve({ id: 'test' }),
  });
describe('transmission detail after erasure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ data: { user: { id: 'sender' } } });
    mocks.read.mockResolvedValue({ data: { recipient_user_id: null }, error: null });
  });
  it('returns an unavailable name without querying a null profile', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).transmission).toMatchObject({
      recipientName: null,
      isRecipient: false,
    });
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it('still resolves the name of a live recipient', async () => {
    mocks.read.mockResolvedValue({ data: { recipient_user_id: 'recipient' }, error: null });
    expect((await (await request()).json()).transmission.recipientName).toBe('Amina');
    expect(mocks.profile).toHaveBeenCalledWith('id', 'recipient');
  });
  it('does not access service data when RLS hides the transmission', async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
