import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/server/course-generation-access', () => ({
  loadOwnedCourseForGeneration: mocks.load,
  CourseAccessError: class extends Error {},
}));
import { GET } from '@/app/api/courses/[courseId]/resume/route';
const courseId = '00000000-0036-4000-8000-000000000149';
const orgId = '00000000-0036-4000-8000-000000000144';
const request = () =>
  GET(new NextRequest(`http://localhost/api/courses/${courseId}/resume?orgId=${orgId}`), {
    params: Promise.resolve({ courseId }),
  });
describe('course resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'verified' } });
    mocks.load.mockResolvedValue({ id: courseId, outline: { scenes: [] } });
  });
  it('requires authentication', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await request()).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('does not fabricate a plan for a legacy draft', async () => {
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('PLAN_UNAVAILABLE');
    expect(mocks.load).toHaveBeenCalledWith(courseId, orgId, 'verified');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('does not expose lookup errors', async () => {
    mocks.load.mockRejectedValue(new Error('secret detail'));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret detail');
  });
});
