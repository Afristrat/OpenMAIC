import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverNextLtiGrade } from '@/lib/lti/worker';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), platform: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('@/lib/lti/index', () => ({ getPlatformConfig: mocks.platform }));
vi.mock('@/lib/lti/grade-service', () => ({ submitGrade: mocks.send, AGS_SCORE_SCOPE: 'score' }));
const id = '00000000-0034-4000-8000-000000000001';
const job = {
  id,
  lease_id: id,
  client_id: 'client',
  org_id: id,
  user_binding_id: id,
  resource_binding_id: id,
  line_item_url: 'https://lms.example.org/item',
  score: 80,
  score_changed_at: '2026-09-08T20:00:00.000Z',
};
function lookup(data: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
describe('LTI durable worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValue({ data: true, error: null });
    mocks.platform.mockResolvedValue({ clientId: 'client' });
    mocks.from
      .mockReturnValueOnce(lookup({ user_id: id, lms_subject: 'learner' }))
      .mockReturnValueOnce(lookup({ resource_link_id: 'assignment' }))
      .mockReturnValueOnce(lookup({ status: 'active' }));
  });
  it('acknowledges the claimed lease and immutable score after acceptance', async () => {
    mocks.send.mockResolvedValue({ success: true, retryable: false, error: null });
    expect(await deliverNextLtiGrade()).toBe(true);
    expect(mocks.send).toHaveBeenCalledWith(
      { clientId: 'client' },
      job.line_item_url,
      expect.objectContaining({ userId: 'learner', scoreGiven: 80 }),
      expect.objectContaining({
        qalemUserId: id,
        resourceLinkId: 'assignment',
        timestamp: job.score_changed_at,
      }),
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_lti_grade', {
      p_id: id,
      p_lease: id,
      p_success: true,
      p_retryable: false,
      p_error: null,
    });
  });
  it('persists retry classification instead of sleeping in the browser request', async () => {
    mocks.send.mockResolvedValue({ success: false, retryable: true, error: 'AGS score HTTP 503' });
    await deliverNextLtiGrade();
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'finish_lti_grade',
      expect.objectContaining({ p_success: false, p_retryable: true }),
    );
  });
  it('reports failed acknowledgement rather than claiming completion', async () => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValue({ data: false, error: null });
    mocks.send.mockResolvedValue({ success: true, retryable: false, error: null });
    await expect(deliverNextLtiGrade()).rejects.toThrow('acknowledgement failed');
  });
  it('does not send for an inactive tenant', async () => {
    mocks.from
      .mockReset()
      .mockReturnValueOnce(lookup({ user_id: id, lms_subject: 'learner' }))
      .mockReturnValueOnce(lookup({ resource_link_id: 'assignment' }))
      .mockReturnValueOnce(lookup({ status: 'suspended' }));
    await deliverNextLtiGrade();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'finish_lti_grade',
      expect.objectContaining({ p_success: false, p_retryable: false }),
    );
  });
});
