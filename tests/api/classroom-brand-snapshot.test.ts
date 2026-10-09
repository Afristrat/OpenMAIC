import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readClassroomOwnership: vi.fn(),
  requireSuperAdminOrOrgEditor: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  readClassroom: vi.fn(),
  updateClassroomBrandSnapshot: vi.fn(),
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  readClassroomOwnership: mocks.readClassroomOwnership,
  readClassroom: mocks.readClassroom,
  updateClassroomBrandSnapshot: mocks.updateClassroomBrandSnapshot,
}));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgEditor: mocks.requireSuperAdminOrOrgEditor,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createServiceSupabaseClient,
}));

import { POST } from '@/app/api/classroom/[classroomId]/brand-snapshot/route';

describe('POST /api/classroom/[classroomId]/brand-snapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed classroom IDs before accessing ownership or storage', async () => {
    const response = await POST({} as never, {
      params: Promise.resolve({ classroomId: '../private' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.readClassroomOwnership).not.toHaveBeenCalled();
    expect(mocks.createServiceSupabaseClient).not.toHaveBeenCalled();
  });
});
