import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  membership: null as { role: string; organizations: { status: string } } | null,
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

import {
  requireSuperAdminOrOrgAdmin,
  requireSuperAdminOrOrgAuthor,
  requireSuperAdminOrOrgEditor,
  requireSuperAdminOrOrgMember,
} from '@/lib/api/auth';

const request = new NextRequest('https://qalem.ma/api/classroom');

describe('classroom RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPER_ADMIN_EMAILS', 'root@qalem.ma');
    mocks.user = { id: 'user-1', email: 'member@qalem.ma' };
    mocks.membership = { role: 'apprenant', organizations: { status: 'active' } };
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
    mocks.membership = { role, organizations: { status: 'active' } };

    const result = await requireSuperAdminOrOrgAdmin(request, 'org-target');

    expect(result.user?.id).toBe('user-1');
    expect(mocks.single).toHaveBeenCalledOnce();
  });

  it('refuses classroom generation to a trainer without an admin role', async () => {
    mocks.membership = { role: 'formateur', organizations: { status: 'active' } };

    const result = await requireSuperAdminOrOrgAdmin(request, 'org-target');

    expect(result.response?.status).toBe(403);
  });

  it.each(['admin', 'manager', 'author'])('lets the %s role author a classroom', async (role) => {
    mocks.membership = { role, organizations: { status: 'active' } };

    const result = await requireSuperAdminOrOrgAuthor(request, 'org-target');

    expect(result.user?.id).toBe('user-1');
    if ('authoredByRole' in result) expect(result.authoredByRole).toBe('author');
  });

  it('records the configured super-admin as the cross-organization author', async () => {
    mocks.user = { id: 'root-1', email: 'ROOT@qalem.ma' };

    const result = await requireSuperAdminOrOrgAuthor(request, 'org-target');

    if ('authoredByRole' in result) expect(result.authoredByRole).toBe('super-admin');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('lets an author edit a classroom they own', async () => {
    mocks.membership = { role: 'author', organizations: { status: 'active' } };

    const result = await requireSuperAdminOrOrgEditor(request, 'org-target', 'user-1');

    expect(result.user?.id).toBe('user-1');
  });

  it('refuses an author access to another author’s classroom', async () => {
    mocks.membership = { role: 'author', organizations: { status: 'active' } };

    const result = await requireSuperAdminOrOrgEditor(request, 'org-target', 'other-author');

    expect(result.response?.status).toBe(403);
  });

  it.each(['admin', 'manager'])(
    'lets the %s edit every classroom in its organization',
    async (role) => {
      mocks.membership = { role, organizations: { status: 'active' } };

      const result = await requireSuperAdminOrOrgEditor(request, 'org-target', 'other-author');

      expect(result.user?.id).toBe('user-1');
    },
  );

  it('lets the super-admin edit a classroom without tenant membership', async () => {
    mocks.user = { id: 'root-1', email: 'ROOT@qalem.ma' };

    const result = await requireSuperAdminOrOrgEditor(request, 'org-target', 'other-author');

    expect(result.user?.id).toBe('root-1');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('lets a learner read classrooms from their own organization', async () => {
    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.user?.id).toBe('user-1');
  });

  it('blocks every tenant-scoped access while the organization is suspended', async () => {
    mocks.membership = {
      role: 'admin',
      organizations: { status: 'suspended' },
    };

    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.response?.status).toBe(403);
  });

  it('returns 403 to an authenticated user outside the organization', async () => {
    mocks.membership = null;

    const result = await requireSuperAdminOrOrgMember(request, 'org-target');

    expect(result.response?.status).toBe(403);
  });
});
