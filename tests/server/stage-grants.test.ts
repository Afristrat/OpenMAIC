import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  existing: { data: null as unknown, error: null as unknown },
  insert: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => mocks.existing,
        insert: (row: unknown) => mocks.insert(row),
        delete: () => ({
          eq: () => ({ eq: async () => mocks.del() }),
        }),
      };
      return query;
    },
  }),
}));

import {
  grantStageByEmail,
  hasStageGrant,
  normalizeShareEmail,
  revokeStageGrant,
} from '@/lib/server/stage-grants';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = { data: null, error: null };
  mocks.rpc.mockResolvedValue({ data: 'user-1', error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.del.mockResolvedValue({ error: null });
});

const INPUT = { stageId: 's1', email: 'a@b.co', grantedBy: 'admin-1' };

describe('normalizeShareEmail', () => {
  it.each([
    ['  Personne@Exemple.MA ', 'personne@exemple.ma'],
    ['a@b.co', 'a@b.co'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeShareEmail(input)).toBe(expected);
  });

  it.each([['pas-une-adresse'], ['a@b'], ['a b@c.d'], [''], [42], [null], [undefined]])(
    'rejects %s',
    (input) => {
      expect(normalizeShareEmail(input)).toBeNull();
    },
  );

  it('rejects an address longer than 254 characters', () => {
    expect(normalizeShareEmail(`${'a'.repeat(250)}@b.co`)).toBeNull();
  });
});

describe('grantStageByEmail', () => {
  it('creates the right for an existing account and records who shared', async () => {
    expect(await grantStageByEmail(INPUT)).toEqual({ status: 'granted', userId: 'user-1' });
    expect(mocks.rpc).toHaveBeenCalledWith('find_user_id_by_email', { p_email: 'a@b.co' });
    expect(mocks.insert).toHaveBeenCalledWith({
      stage_id: 's1',
      user_id: 'user-1',
      granted_by: 'admin-1',
    });
  });

  it('reports an unknown address without writing anything', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await grantStageByEmail(INPUT)).toEqual({ status: 'no_account' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('is idempotent when the right already exists', async () => {
    mocks.existing = { data: { stage_id: 's1' }, error: null };
    expect(await grantStageByEmail(INPUT)).toEqual({ status: 'already', userId: 'user-1' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate insert as already granted', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    expect((await grantStageByEmail(INPUT)).status).toBe('already');
  });

  it('throws on a failed account lookup or insert', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(grantStageByEmail(INPUT)).rejects.toThrow('resolve account');
    mocks.rpc.mockResolvedValue({ data: 'user-1', error: null });
    mocks.insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    await expect(grantStageByEmail(INPUT)).rejects.toThrow('grant stage');
  });
});

describe('hasStageGrant and revokeStageGrant', () => {
  it('answers from the grant row', async () => {
    mocks.existing = { data: { stage_id: 's1' }, error: null };
    expect(await hasStageGrant('s1', 'user-1')).toBe(true);
    mocks.existing = { data: null, error: null };
    expect(await hasStageGrant('s1', 'user-1')).toBe(false);
  });

  it('throws when the verification fails instead of granting by default', async () => {
    mocks.existing = { data: null, error: { message: 'offline' } };
    await expect(hasStageGrant('s1', 'user-1')).rejects.toThrow('verify stage grant');
  });

  it('revokes and surfaces failures', async () => {
    await expect(revokeStageGrant('s1', 'user-1')).resolves.toBeUndefined();
    mocks.del.mockResolvedValue({ error: { message: 'offline' } });
    await expect(revokeStageGrant('s1', 'user-1')).rejects.toThrow('revoke stage grant');
  });
});
