import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningObservationBuffer } from '@/lib/telemetry/learning-observation-buffer';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
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
  });
  afterEach(() => vi.unstubAllEnvs());

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
        completion_rate: 0,
        total_duration: 0,
        action_counts: { play: 0, pause: 0, seek: 0 },
      },
    });
  });
});
