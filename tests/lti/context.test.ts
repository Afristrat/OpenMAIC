import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LtiAccessDenied, loadLtiQuiz, resolveLtiContext } from '@/lib/lti/context';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));
const id = '00000000-0034-4000-8000-000000000001';
const input = { token: 'a'.repeat(64), userId: id, stageId: 'bound-stage' };
const session = {
  id,
  org_id: id,
  client_id: 'client',
  resource_binding_id: id,
  user_binding_id: id,
  expires_at: '2099-01-01T00:00:00Z',
  line_item_url: 'https://lms.example/lineitem',
  ags_scopes: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
};
function query(data: unknown, error: object | null = null) {
  const result = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  result.select.mockReturnValue(result);
  result.eq.mockReturnValue(result);
  return result;
}
function allow() {
  const lookup = query(session);
  mocks.from.mockReturnValueOnce(lookup);
  const checks = Array.from({ length: 4 }, () => query({ id, user_id: id }));
  checks.forEach((check) => mocks.from.mockReturnValueOnce(check));
  return { lookup, checks };
}
describe('LTI classroom capability authorization', () => {
  beforeEach(() => mocks.from.mockReset());
  it('hashes the cookie and binds access to current Auth user and requested classroom', async () => {
    const { lookup, checks } = allow();
    expect(await resolveLtiContext(input)).toMatchObject({ orgId: id, gradingEnabled: true });
    expect(lookup.eq).toHaveBeenCalledWith(
      'token_hash',
      createHash('sha256').update(input.token).digest('hex'),
    );
    expect(checks[0].eq).toHaveBeenCalledWith('stage_id', input.stageId);
    expect(checks[1].eq).toHaveBeenCalledWith('user_id', input.userId);
    expect(checks[2].eq).toHaveBeenCalledWith('status', 'active');
    expect(checks[3].eq).toHaveBeenCalledWith('user_id', input.userId);
  });
  it.each([null, { ...session, expires_at: '2000-01-01T00:00:00Z' }])(
    'rejects missing or expired launches',
    async (data) => {
      mocks.from.mockReturnValueOnce(query(data));
      await expect(resolveLtiContext(input)).rejects.toBeInstanceOf(LtiAccessDenied);
      expect(mocks.from).toHaveBeenCalledTimes(1);
    },
  );
  it.each([0, 1, 2, 3])(
    'refuses failed access predicate %i before reading quiz content',
    async (index) => {
      const { checks } = allow();
      checks[index].maybeSingle.mockResolvedValue({ data: null, error: null });
      await expect(loadLtiQuiz(input, 'quiz')).rejects.toBeInstanceOf(LtiAccessDenied);
      expect(mocks.from).not.toHaveBeenCalledWith('scenes');
    },
  );
  it('keeps database outages distinct from denied access', async () => {
    mocks.from.mockReturnValueOnce(query(null, { message: 'private detail' }));
    await expect(resolveLtiContext(input)).rejects.toThrow('LTI session lookup unavailable');
  });
  it('reads only the quiz scene of the authorized classroom', async () => {
    allow();
    const scene = query({ content: { type: 'quiz', questions: [] } });
    mocks.from.mockReturnValueOnce(scene);
    expect((await loadLtiQuiz(input, 'quiz')).content).toEqual({ type: 'quiz', questions: [] });
    expect(scene.eq.mock.calls).toEqual([
      ['id', 'quiz'],
      ['stage_id', 'bound-stage'],
      ['type', 'quiz'],
    ]);
  });
  it('refuses score correction without the launch scope', async () => {
    const { lookup } = allow();
    lookup.maybeSingle.mockResolvedValue({ data: { ...session, ags_scopes: [] }, error: null });
    await expect(loadLtiQuiz(input, 'quiz')).rejects.toBeInstanceOf(LtiAccessDenied);
    expect(mocks.from).not.toHaveBeenCalledWith('scenes');
  });
});
