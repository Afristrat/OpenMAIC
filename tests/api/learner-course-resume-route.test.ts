import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), save: vi.fn(), resolve: vi.fn() }));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/server/learner-course-resume', async () => {
  class LearnerCourseResumeAccessError extends Error {}
  return {
    LearnerCourseResumeAccessError,
    saveLearnerCourseResume: mocks.save,
    resolveLearnerCourseResume: mocks.resolve,
  };
});

import { POST } from '@/app/api/learner-courses/[courseId]/resume/route';
import { GET } from '@/app/api/learner-courses/[courseId]/resume-target/route';

const courseId = '00000000-0000-4000-8000-000000000001';
const orgId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';

describe('learner course resume API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: userId, email: 'learner@example.com' } });
    mocks.save.mockResolvedValue({ course_id: courseId, scene_id: 'scene-2' });
    mocks.resolve.mockResolvedValue({
      stage_id: 'stage-1',
      scene_id: 'scene-2',
      activity: 'quiz',
      activity_state: { draftAnswer: 'B' },
      position_ms: 12000,
    });
  });

  it('records only an authenticated, same-origin learner position', async () => {
    const response = await POST(
      new NextRequest(`https://qalem.ma/api/learner-courses/${courseId}/resume`, {
        method: 'POST',
        headers: { origin: 'https://qalem.ma' },
        body: JSON.stringify({ orgId, sceneId: 'scene-2', activity: 'quiz', positionMs: 12000 }),
      }),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: userId, courseId, orgId, sceneId: 'scene-2' }),
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('refuses a cross-site progress write before it reaches persistence', async () => {
    const response = await POST(
      new NextRequest(`https://qalem.ma/api/learner-courses/${courseId}/resume`, {
        method: 'POST',
        headers: { origin: 'https://other.invalid' },
        body: JSON.stringify({ orgId, sceneId: 'scene-2', activity: 'quiz', positionMs: 12000 }),
      }),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('never reveals a resume target after access disappears', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    const response = await GET(
      new NextRequest(
        `https://qalem.ma/api/learner-courses/${courseId}/resume-target?orgId=${orgId}`,
      ),
      { params: Promise.resolve({ courseId }) },
    );
    expect(response.status).toBe(404);
  });
});
