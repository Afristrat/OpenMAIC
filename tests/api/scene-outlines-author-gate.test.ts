import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireAuthor: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgAuthor: mocks.requireAuthor,
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));
vi.mock('@/lib/ai/llm', () => ({ streamLLM: vi.fn() }));

function post(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/generate/scene-outlines-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ user: { id: 'user-1', email: 'a@example.com' } });
  mocks.requireAuthor.mockResolvedValue({ user: { id: 'user-1', email: 'a@example.com' } });
  mocks.resolveModelFromRequest.mockRejectedValue(new Error('model not configured'));
});

describe('POST /api/generate/scene-outlines-stream authorization', () => {
  it('requires an organization before any model work', async () => {
    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    const response = await POST(post({ requirements: { requirement: 'x' } }));
    expect(response.status).toBe(400);
    expect(mocks.requireAuthor).not.toHaveBeenCalled();
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('refuses a signed-in account that may not author in that organization', async () => {
    mocks.requireAuthor.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    const response = await POST(post({ orgId: 'org-1', requirements: { requirement: 'x' } }));
    expect(response.status).toBe(403);
    expect(mocks.requireAuthor).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('lets an author reach the model resolution', async () => {
    const { POST } = await import('@/app/api/generate/scene-outlines-stream/route');
    await POST(post({ orgId: 'org-1', requirements: { requirement: 'x' } }));
    expect(mocks.resolveModelFromRequest).toHaveBeenCalledOnce();
  });
});
