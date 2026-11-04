import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  existing: { data: null as unknown, error: null as unknown },
  pending: { data: null as unknown, error: null as unknown },
  insert: vi.fn(),
  inviteInsert: vi.fn(),
  del: vi.fn(),
  tables: [] as string[],
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      mocks.tables.push(table);
      const isInvitation = table === 'stage_grant_invitations';
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => (isInvitation ? mocks.pending : mocks.existing),
        insert: (row: unknown) =>
          isInvitation
            ? { select: () => ({ single: async () => mocks.inviteInsert(row) }) }
            : Promise.resolve(mocks.insert(row)),
        delete: () => {
          const chain = {
            eq: () => chain,
            is: () => chain,
            lte: () => chain,
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(mocks.del()).then(resolve),
          };
          return chain;
        },
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
  revokeStageInvitation,
} from '@/lib/server/stage-grants';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables.length = 0;
  mocks.existing = { data: null, error: null };
  mocks.pending = { data: null, error: null };
  mocks.rpc.mockResolvedValue({ data: 'user-1', error: null });
  mocks.insert.mockReturnValue({ error: null });
  mocks.inviteInsert.mockResolvedValue({ data: { id: 'inv-1', token: 'tok-1' }, error: null });
  mocks.del.mockReturnValue({ error: null });
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

  it('invites an address without account: one classroom, never an organization membership', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await grantStageByEmail(INPUT)).toEqual({
      status: 'invited',
      invitationId: 'inv-1',
      token: 'tok-1',
    });
    expect(mocks.inviteInsert).toHaveBeenCalledWith({
      stage_id: 's1',
      email: 'a@b.co',
      created_by: 'admin-1',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.tables).not.toContain('org_invitations');
    expect(mocks.tables).not.toContain('org_members');
  });

  it('reuses a still valid invitation for the same address instead of creating another', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.pending = { data: { id: 'inv-9', token: 'tok-9' }, error: null };
    expect(await grantStageByEmail(INPUT)).toEqual({
      status: 'invited',
      invitationId: 'inv-9',
      token: 'tok-9',
    });
    expect(mocks.inviteInsert).not.toHaveBeenCalled();
  });

  it('is idempotent when the right already exists', async () => {
    mocks.existing = { data: { stage_id: 's1' }, error: null };
    expect(await grantStageByEmail(INPUT)).toEqual({ status: 'already', userId: 'user-1' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('treats a concurrent duplicate insert as already granted', async () => {
    mocks.insert.mockReturnValue({ error: { code: '23505', message: 'duplicate' } });
    expect((await grantStageByEmail(INPUT)).status).toBe('already');
  });

  it('throws on a failed account lookup, grant insert or invitation insert', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(grantStageByEmail(INPUT)).rejects.toThrow('resolve account');
    mocks.rpc.mockResolvedValue({ data: 'user-1', error: null });
    mocks.insert.mockReturnValue({ error: { code: '42501', message: 'denied' } });
    await expect(grantStageByEmail(INPUT)).rejects.toThrow('grant stage');
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.inviteInsert.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(grantStageByEmail(INPUT)).rejects.toThrow('invite');
  });
});

describe('hasStageGrant and revocations', () => {
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

  it('revokes a grant or a pending invitation and surfaces failures', async () => {
    await expect(revokeStageGrant('s1', 'user-1')).resolves.toBeUndefined();
    await expect(revokeStageInvitation('s1', 'inv-1')).resolves.toBeUndefined();
    mocks.del.mockReturnValue({ error: { message: 'offline' } });
    await expect(revokeStageGrant('s1', 'user-1')).rejects.toThrow('revoke stage grant');
    await expect(revokeStageInvitation('s1', 'inv-1')).rejects.toThrow('revoke stage invitation');
  });
});
