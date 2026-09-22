import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
  result: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: mocks.from,
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
import {
  assertCourseGenerationAccess,
  CourseAccessError,
  resolveGenerationResourceOwner,
} from '@/lib/server/course-generation-access';
const courseId = '00000000-0036-4000-8000-000000000149';
const manifestId = '00000000-0036-4000-8000-000000000150';
const courseOwnerId = '00000000-0036-4000-8000-000000000151';
const input = { courseId, orgId: 'tenant', sourceManifestId: manifestId };
describe('course generation access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'platform@example.com');
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: 'author@example.com' } },
      error: null,
    });
    const query = {
      select: () => query,
      eq: mocks.eq,
      in: mocks.in,
      order: mocks.order,
      abortSignal: () => query,
      maybeSingle: mocks.result,
    };
    for (const mock of [mocks.from, mocks.eq, mocks.in, mocks.order]) mock.mockReturnValue(query);
    mocks.result
      .mockReset()
      .mockResolvedValueOnce({ data: { role: 'admin' } })
      .mockResolvedValue({
        data: {
          id: courseId,
          owner_id: courseOwnerId,
          title: 'Saved',
          language: 'fr-FR',
          source_manifest_id: manifestId,
          outline: {},
          status: 'draft',
          source_kind: 'generated',
          import_id: null,
        },
      });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('checks membership even for a new course', async () => {
    await assertCourseGenerationAccess({ orgId: 'tenant' }, 'owner');
    expect(mocks.from).toHaveBeenCalledWith('org_members');
    expect(mocks.from).not.toHaveBeenCalledWith('courses');
  });
  it('refuses a new course without an actor or after membership deletion', async () => {
    await expect(assertCourseGenerationAccess({ orgId: 'tenant' })).rejects.toBeInstanceOf(
      CourseAccessError,
    );
    mocks.result.mockReset().mockResolvedValue({ data: null });
    await expect(
      assertCourseGenerationAccess({ orgId: 'tenant' }, 'deleted-owner'),
    ).rejects.toBeInstanceOf(CourseAccessError);
  });
  it('requires a verified owner', async () => {
    await expect(assertCourseGenerationAccess(input)).rejects.toBeInstanceOf(CourseAccessError);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('checks active author membership and exact tenant ownership', async () => {
    await assertCourseGenerationAccess(input, 'owner');
    for (const [field, value] of [
      ['user_id', 'owner'],
      ['organizations.status', 'active'],
      ['id', courseId],
      ['org_id', 'tenant'],
      ['owner_id', 'owner'],
    ])
      expect(mocks.eq).toHaveBeenCalledWith(field, value);
    expect(mocks.in).toHaveBeenCalledWith('role', ['admin', 'manager', 'formateur']);
    expect(mocks.in).toHaveBeenCalledWith('status', ['draft', 'ready']);
  });
  it('refuses a changed or omitted source manifest', async () => {
    await expect(
      assertCourseGenerationAccess({ ...input, sourceManifestId: undefined }, 'owner'),
    ).rejects.toBeInstanceOf(CourseAccessError);
  });
  it('refuses a course no longer owned by this actor', async () => {
    mocks.result
      .mockReset()
      .mockResolvedValueOnce({ data: { role: 'admin' } })
      .mockResolvedValue({ data: null });
    await expect(assertCourseGenerationAccess(input, 'owner')).rejects.toBeInstanceOf(
      CourseAccessError,
    );
  });
  it('fails closed when membership lookup fails', async () => {
    mocks.result.mockReset().mockResolvedValue({ error: { message: 'private details' } });
    await expect(assertCourseGenerationAccess(input, 'owner')).rejects.toThrow(
      'Course authorization unavailable',
    );
    expect(mocks.from).not.toHaveBeenCalledWith('courses');
  });

  it('attributes a new super-admin generation to the tenant admin', async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: 'platform@example.com' } },
      error: null,
    });
    mocks.order.mockResolvedValue({
      data: [
        { user_id: 'trainer-id', role: 'formateur', created_at: '2026-01-01' },
        { user_id: 'tenant-admin-id', role: 'admin', created_at: '2026-01-02' },
      ],
      error: null,
    });

    await expect(
      resolveGenerationResourceOwner({ actorId: 'platform-id', orgId: 'tenant' }),
    ).resolves.toBe('tenant-admin-id');
    expect(mocks.in).toHaveBeenCalledWith('role', ['admin', 'manager', 'formateur']);
  });

  it('preserves the existing tenant owner when a super-admin regenerates a course', async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: { email: 'platform@example.com' } },
      error: null,
    });
    mocks.result.mockReset().mockResolvedValue({
      data: { owner_id: courseOwnerId },
      error: null,
    });

    await expect(
      resolveGenerationResourceOwner({
        actorId: 'platform-id',
        orgId: 'tenant',
        courseId,
      }),
    ).resolves.toBe(courseOwnerId);
  });
});
