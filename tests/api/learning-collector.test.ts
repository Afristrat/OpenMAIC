import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn(), discussion: vi.fn() }));
vi.mock('@/lib/telemetry/discussion-collector', () => ({
  collectDiscussionData: mocks.discussion,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { collectPedagogyData } from '@/lib/telemetry/pedagogy-collector';

const actor = '00000000-0036-4000-8000-000000000001';
const epoch = '00000000-0036-4000-8000-000000000002';
const session = '00000000-0036-4000-8000-000000000003';
const orgId = '00000000-0036-4000-8000-000000000004';

describe('learning collector RPC boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
    mocks.abort.mockResolvedValue({ data: true, error: null });
    mocks.discussion.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('acknowledges only after child discussions and retains failures for whole-envelope replay', async () => {
    const buffer = new LearningObservationBuffer('stage', epoch, session, () => 0, orgId);
    buffer.scene('scene', 'slide');
    const scope = {
      stageId: 'stage',
      sceneId: 'scene',
      orgId,
      discussionId: '00000000-0047-4000-8000-000000000003',
    };
    buffer.discussionTurn({ ...scope, phase: 'begin' });
    buffer.discussionTurn({ ...scope, phase: 'start', messageId: 'one', agentId: 'agent' });
    buffer.discussionTurn({ ...scope, phase: 'end' });
    const payload = buffer.snapshot(['scene'], 1)!;
    mocks.discussion.mockRejectedValueOnce(new Error('Discussion unavailable'));
    await expect(collectPedagogyData(actor, payload)).rejects.toThrow('Discussion unavailable');
    expect(await collectPedagogyData(actor, payload)).toBe(true);
    expect(mocks.discussion).toHaveBeenLastCalledWith(actor, {
      stageId: 'stage',
      orgId,
      consentEpoch: epoch,
      observation: payload.discussions![0],
    });
    mocks.abort.mockResolvedValueOnce({ data: false, error: null });
    mocks.discussion.mockClear();
    expect(await collectPedagogyData(actor, payload)).toBe(false);
    expect(mocks.discussion).not.toHaveBeenCalled();
    mocks.discussion.mockResolvedValueOnce(false);
    expect(await collectPedagogyData(actor, payload)).toBe(false);
  });

  it.each([orgId, undefined])('forwards the captured scope unchanged (%s)', async (scope) => {
    const buffer = new LearningObservationBuffer('stage', epoch, session, () => 0, scope);
    buffer.scene('scene', 'slide');
    const observation = buffer.snapshot(['scene'], 2)!;
    expect(await collectPedagogyData(actor, observation)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('record_consented_learning', {
      p_actor: actor,
      p_session: session,
      p_stage: 'stage',
      p_epoch: epoch,
      p_org: scope ?? null,
      p_payload: {
        scene_sequence: ['slide'],
        scene_durations: [0],
        quiz_scores: [],
        scene_observations: [
          {
            id: 'scene',
            type: 'slide',
            seconds: 0,
            completed: false,
            score: null,
            discussionMessages: 0,
          },
        ],
        completion_rate: 0,
        total_duration: 0,
        action_counts: { play: 0, pause: 0, seek: 0 },
      },
    });
  });
});
