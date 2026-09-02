import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireOrgAuthor: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/config/feature-flags', () => ({ isMaicEditorEnabled: () => true }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: mocks.requireOrgAuthor,
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
    expect(mocks.requireOrgAuthor).not.toHaveBeenCalled();
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });
});
