import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  resolve: vi.fn(),
  defer: vi.fn(),
  claimSlot: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/server/learner-course-resume', () => ({
  LearnerCourseResumeAccessError: class LearnerCourseResumeAccessError extends Error {},
  resolveLearnerCourseResume: mocks.resolve,
}));
vi.mock('@/lib/notifications/delivery-window', () => ({ shouldDeferDelivery: mocks.defer }));
vi.mock('@/lib/server/notification-delivery-policy', () => ({
  claimNotificationDeliverySlot: mocks.claimSlot,
}));
vi.mock('@/lib/server/web-push', () => ({ sendWebPushToUser: mocks.push }));

import {
  claimDueCourseResumeDeliveries,
  deliverCourseResumeDelivery,
} from '@/lib/server/course-resume-deliveries';

const delivery = {
  id: '00000000-0000-4000-8000-000000000001',
  course_id: '00000000-0000-4000-8000-000000000002',
  user_id: '00000000-0000-4000-8000-000000000003',
  sent_at: null,
  cancelled_at: null,
};

function query(result: unknown) {
  const chain = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

describe('course resume deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.resolve.mockResolvedValue({ course_id: delivery.course_id });
    mocks.defer.mockReturnValue(false);
    mocks.claimSlot.mockResolvedValue(true);
    mocks.push.mockResolvedValue([{ status: 'accepted' }]);
  });

  it('claims only rows atomically returned by the database lifecycle', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ ...delivery, scheduled_for: '2026-09-14T10:00:00Z' }],
      error: null,
    });

    await expect(
      claimDueCourseResumeDeliveries(new Date('2026-09-14T10:00:00Z')),
    ).resolves.toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_due_course_resume_deliveries', {
      p_now: '2026-09-14T10:00:00.000Z',
    });
  });

  it('cancels a delivery when the learner no longer has resumable activity', async () => {
    const lookup = query({ data: delivery, error: null });
    const noResume = query({ data: null, error: null });
    const cancel = query({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'course_resume_deliveries' && mocks.from.mock.calls.length === 1) return lookup;
      if (table === 'learner_course_resumes') return noResume;
      return cancel;
    });

    await expect(deliverCourseResumeDelivery(delivery.id)).resolves.toBeUndefined();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(cancel.update).toHaveBeenCalledWith(
      expect.objectContaining({ cancelled_at: expect.any(String) }),
    );
  });

  it('pushes a neutral reminder only after scope and pressure checks pass', async () => {
    const lookup = query({ data: delivery, error: null });
    const resume = query({
      data: {
        ...delivery,
        org_id: '00000000-0000-4000-8000-000000000004',
        completed_at: null,
        abandoned_at: null,
      },
      error: null,
    });
    const preferences = query({ data: null, error: null });
    const complete = query({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'course_resume_deliveries' && mocks.from.mock.calls.length === 1) return lookup;
      if (table === 'learner_course_resumes') return resume;
      if (table === 'review_notification_preferences') return preferences;
      return complete;
    });

    await deliverCourseResumeDelivery(delivery.id);

    expect(mocks.claimSlot).toHaveBeenCalledWith({
      userId: delivery.user_id,
      courseId: delivery.course_id,
      source: 'course_resume_delivery',
      sourceId: delivery.id,
    });
    expect(mocks.push).toHaveBeenCalledWith(
      delivery.user_id,
      expect.objectContaining({
        body: 'Une activité vous attend.',
        targetUrl:
          `/app?learnerResumeCourseId=${delivery.course_id}` +
          '&learnerResumeOrgId=00000000-0000-4000-8000-000000000004',
      }),
    );
    expect(complete.update).toHaveBeenCalledWith({ sent_at: expect.any(String) });
  });

  it('does not claim a shared budget while this formation is paused', async () => {
    const lookup = query({ data: delivery, error: null });
    const resume = query({
      data: { ...delivery, org_id: '00000000-0000-4000-8000-000000000004' },
      error: null,
    });
    const preferences = query({ data: null, error: null });
    const coursePreferences = query({
      data: { paused_until: '2999-01-01T00:00:00.000Z' },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'course_resume_deliveries' && mocks.from.mock.calls.length === 1) return lookup;
      if (table === 'learner_course_resumes') return resume;
      if (table === 'review_notification_preferences') return preferences;
      if (table === 'course_notification_preferences') return coursePreferences;
      throw new Error(`Unexpected table ${table}`);
    });

    await deliverCourseResumeDelivery(delivery.id);

    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
