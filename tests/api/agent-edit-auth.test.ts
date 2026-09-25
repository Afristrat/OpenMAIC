import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireOrgEditor: vi.fn(),
  readClassroomOwnership: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/config/feature-flags', () => ({ isMaicEditorEnabled: () => true }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgEditor: mocks.requireOrgEditor,
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroomOwnership: mocks.readClassroomOwnership,
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));

describe('POST /api/agent/edit tenant boundary', () => {
  it('rejects an unscoped editor agent turn before model resolution', async () => {
    const { POST } = await import('@/app/api/agent/edit/route');
    const request = new Request('http://localhost/api/agent/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Améliore cette scène.' }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(400);
    expect(mocks.readClassroomOwnership).not.toHaveBeenCalled();
    expect(mocks.requireOrgEditor).not.toHaveBeenCalled();
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('rejects an unknown classroom before authorization and model resolution', async () => {
    mocks.readClassroomOwnership.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/agent/edit/route');
    const request = new Request('http://localhost/api/agent/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classroomId: 'missing-stage', message: 'Améliore cette scène.' }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(404);
    expect(mocks.requireOrgEditor).not.toHaveBeenCalled();
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('derives the tenant from the classroom and applies its time-limited editor gate', async () => {
    mocks.readClassroomOwnership.mockResolvedValueOnce({
      orgId: 'org-from-stage',
      ownerId: 'owner-from-stage',
    });
    mocks.requireOrgEditor.mockResolvedValueOnce({
      user: null,
      response: new Response('Forbidden', { status: 403 }),
    });
    const { POST } = await import('@/app/api/agent/edit/route');
    const request = new Request('http://localhost/api/agent/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classroomId: 'stage-1',
        orgId: 'org-forged',
        message: 'Améliore cette scène.',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(403);
    expect(mocks.requireOrgEditor).toHaveBeenCalledWith(
      request,
      'org-from-stage',
      'owner-from-stage',
      'stage-1',
    );
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });
});
