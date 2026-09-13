import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), from: vi.fn(), rpc: vi.fn() }));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import { GET, PUT } from '@/app/api/courses/[courseId]/notification-preferences/route';

const courseId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const context = { params: Promise.resolve({ courseId }) };

function request(method: 'GET' | 'PUT', body?: unknown, origin = 'https://qalem.ma'): NextRequest {
  return new NextRequest(`https://qalem.ma/api/courses/${courseId}/notification-preferences`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('/api/courses/[courseId]/notification-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: userId, email: 'learner@example.com' } });
    mocks.rpc.mockResolvedValue({ data: [{ next_reminder_at: null }], error: null });
  });

  it('reads preferences only for the authenticated learner', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const secondEq = vi.fn().mockReturnValue({ maybeSingle });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: firstEq }) });

    const response = await GET(request('GET'), context);

    expect(response.status).toBe(200);
    expect(firstEq).toHaveBeenCalledWith('course_id', courseId);
    expect(secondEq).toHaveBeenCalledWith('user_id', userId);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_course_notification_preview',
      expect.objectContaining({ target_user_id: userId, target_course_id: courseId }),
    );
    await expect(response.json()).resolves.toMatchObject({
      pausedUntil: null,
      dailyCap: null,
      nextReminderAt: null,
    });
  });

  it('uses the session identity when it stores a course cap', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { paused_until: null, daily_cap: 1 },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ upsert });

    const response = await PUT(
      request('PUT', { pausedUntil: null, dailyCap: 1, minimumIntervalHours: 24 }),
      context,
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      {
        course_id: courseId,
        user_id: userId,
        paused_until: null,
        daily_cap: 1,
        minimum_interval_hours: 24,
      },
      { onConflict: 'course_id,user_id' },
    );
  });

  it('refuses a cross-site write before persistence', async () => {
    const response = await PUT(
      request(
        'PUT',
        { pausedUntil: null, dailyCap: 1, minimumIntervalHours: null },
        'https://other.invalid',
      ),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
