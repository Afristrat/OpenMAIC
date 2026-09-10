import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectDiscussionData,
  discussionSessionSchema,
} from '@/lib/telemetry/discussion-collector';

const { rpc, client } = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceSupabaseClient: client }));
const actor = '00000000-0047-4000-8000-000000000001';
const session = {
  stageId: 'stage',
  orgId: '00000000-0047-4000-8000-000000000002',
  consentEpoch: '00000000-0047-4000-8000-000000000003',
  observation: {
    discussionId: '00000000-0047-4000-8000-000000000004',
    sceneId: 'scene',
    durationBasis: 'client-monotonic-elapsed' as const,
    classificationMethod: 'text-heuristic-v1' as const,
    turns: [
      {
        id: 'turn',
        agentId: 'agent',
        interventionType: 'answer' as const,
        durationMs: 1450,
        outcome: 'completed' as const,
      },
    ],
    postDiscussionQuiz: null,
  },
};

describe('consented discussion persistence boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    client.mockReturnValue({ rpc });
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it('uses the verified actor and one deadline-bound RPC, never a direct insert', async () => {
    expect(await collectDiscussionData(actor, session)).toBe(true);
    expect(client).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(rpc).toHaveBeenCalledWith('record_consented_discussion', {
      p_actor: actor,
      p_stage: session.stageId,
      p_org: session.orgId,
      p_epoch: session.consentEpoch,
      p_observation: session.observation,
    });
  });

  it('distinguishes consent refusal from unavailable or malformed storage', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await collectDiscussionData(actor, session)).toBe(false);
    for (const result of [
      { data: null, error: null },
      { data: true, error: { message: 'private detail' } },
    ]) {
      rpc.mockResolvedValueOnce(result);
      await expect(collectDiscussionData(actor, session)).rejects.toThrow(
        'Discussion observation could not be recorded',
      );
    }
  });

  it('rejects browser identity, context, quiz claims and malformed epochs before network access', async () => {
    for (const input of [
      { ...session, actorId: actor },
      { ...session, userHash: 'forged' },
      { ...session, subjectTags: ['forged'] },
      { ...session, consentEpoch: 'old' },
      {
        ...session,
        observation: { ...session.observation, postDiscussionQuiz: { sceneId: 'quiz', score: 1 } },
      },
    ]) {
      expect(discussionSessionSchema.safeParse(input).success).toBe(false);
    }
    await expect(collectDiscussionData('not-a-user', session)).rejects.toThrow();
    expect(client).not.toHaveBeenCalled();
  });
});
