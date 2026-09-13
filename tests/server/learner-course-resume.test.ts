import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

import {
  LearnerCourseResumeAccessError,
  resolveLearnerCourseResume,
  saveLearnerCourseResume,
} from '@/lib/server/learner-course-resume';

const input = {
  actorId: '00000000-0000-4000-8000-000000000001',
  courseId: '00000000-0000-4000-8000-000000000002',
  orgId: '00000000-0000-4000-8000-000000000003',
  sceneId: 'scene-2',
  activity: 'quiz' as const,
  activityState: { draftAnswer: 'B' },
  positionMs: 12000,
};

describe('learner course resume boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.abortSignal.mockResolvedValue({ data: null, error: null });
  });

  it('persists only the explicit learner position through the tenant-scoped RPC', async () => {
    mocks.abortSignal.mockResolvedValueOnce({
      data: { ...input, course_id: input.courseId, scene_id: input.sceneId },
      error: null,
    });

    await expect(saveLearnerCourseResume(input)).resolves.toMatchObject({
      course_id: input.courseId,
      scene_id: input.sceneId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_learner_course_resume', {
      p_actor: input.actorId,
      p_course: input.courseId,
      p_org: input.orgId,
      p_scene: input.sceneId,
      p_activity: input.activity,
      p_state: input.activityState,
      p_position_ms: input.positionMs,
    });
  });

  it('fails closed for a withdrawn target instead of exposing another course', async () => {
    mocks.abortSignal.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(saveLearnerCourseResume(input)).rejects.toBeInstanceOf(
      LearnerCourseResumeAccessError,
    );
  });

  it('returns no target when the learner has no resumable activity', async () => {
    mocks.abortSignal.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      resolveLearnerCourseResume({
        actorId: input.actorId,
        courseId: input.courseId,
        orgId: input.orgId,
      }),
    ).resolves.toBeNull();
  });
});
