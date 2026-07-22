import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  membership: null as { role: string } | null,
  from: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: mocks.single,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    return {
      auth: { getUser: async () => ({ data: { user: mocks.user } }) },
      from: mocks.from,
    };
  },
}));

import { requireSuperAdminOrOrgAdmin, requireSuperAdminOrOrgMember } from '@/lib/api/auth';

const request = new NextRequest('https://qalem.ma/api/classroom');

describe('classroom RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'root@qalem.ma');
    mocks.user = { id: 'user-1', email: 'member@qalem.ma' };
    mocks.membership = { role: 'apprenant' };
    mocks.single.mockImplementation(async () => ({ data: mocks.membership, error: null }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 when no Supabase session exists', async () => {
    mocks.user = null;

    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.response?.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('lets the configured super-admin pass without a tenant membership lookup', async () => {
    mocks.user = { id: 'root-1', email: 'ROOT@qalem.ma' };

    const result = await requireSuperAdminOrOrgAdmin(request, 'org-target');

    expect(result.user?.id).toBe('root-1');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(['admin', 'manager'])('lets the %s role generate for its organization', async (role) => {
    mocks.membership = { role };

    const result = await requireSuperAdminOrOrgAdmin(request, 'org-target');

    expect(result.user?.id).toBe('user-1');
    expect(mocks.single).toHaveBeenCalledOnce();
  });

  it('refuses classroom generation to a trainer without an admin role', async () => {
    mocks.membership = { role: 'formateur' };

    const result = await requireSuperAdminOrOrgAdmin(request, 'org-target');

    expect(result.response?.status).toBe(403);
  });

  it('lets a learner read classrooms from their own organization', async () => {
    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.user?.id).toBe('user-1');
  });

  it('returns 403 to an authenticated user outside the organization', async () => {
    mocks.membership = null;

    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.response?.status).toBe(403);
  });
});
