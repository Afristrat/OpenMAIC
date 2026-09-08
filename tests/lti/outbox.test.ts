import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueLtiGrade } from '@/lib/lti/outbox';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));
const id = '00000000-0034-4000-8000-000000000001';
const input = {
  contextToken: 'a'.repeat(64),
  userId: id,
  stageId: 'stage',
  sceneId: 'quiz',
  requestId: id,
  score: 80,
};

describe('durable LTI enqueue boundary', () => {
  beforeEach(() => mocks.rpc.mockReset());
  it('sends only the context hash and server quiz identifiers to the atomic enqueue', async () => {
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    expect(await enqueueLtiGrade(input)).toBe(id);
    expect(mocks.rpc).toHaveBeenCalledWith('enqueue_lti_grade', {
      p_token_hash: createHash('sha256').update(input.contextToken).digest('hex'),
      p_user_id: id,
      p_stage_id: 'stage',
      p_scene_id: 'quiz',
      p_score: 80,
      p_request_id: id,
    });
  });
  it.each([NaN, Infinity, -1, 101])('rejects an invalid score %s before writing', async (score) => {
    await expect(enqueueLtiGrade({ ...input, score })).rejects.toThrow('Invalid LTI grade request');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('propagates queue failure without exposing the database message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    await expect(enqueueLtiGrade(input)).rejects.toThrow('LTI grade could not be queued');
  });
});
