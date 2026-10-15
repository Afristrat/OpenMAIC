import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/server/resolve-model', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));

const ROUTES = [
  ['pbl/v2/instructor', '@/app/api/pbl/v2/instructor/route'],
  ['pbl/v2/evaluate', '@/app/api/pbl/v2/evaluate/route'],
  ['pbl/v2/open-task', '@/app/api/pbl/v2/open-task/route'],
  ['pbl/v2/simulator', '@/app/api/pbl/v2/simulator/route'],
  ['pbl/v2/task/update', '@/app/api/pbl/v2/task/update/route'],
  ['generate/scene-outlines-stream', '@/app/api/generate/scene-outlines-stream/route'],
] as const;

function post(path: string): NextRequest {
  return new Request(`http://localhost/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }) as unknown as NextRequest;
}

describe.each(ROUTES)('POST /api/%s authentication', (path, module) => {
  // Cold module graphs are slow on a loaded machine; import once, outside test timeouts.
  beforeAll(async () => {
    await import(/* @vite-ignore */ module);
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModelFromRequest.mockRejectedValue(new Error('model not configured'));
  });

  it('rejects an anonymous request with 401 before any model work', async () => {
    mocks.requireAuth.mockResolvedValue({
      response: new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }),
    });
    const { POST } = await import(/* @vite-ignore */ module);

    const response = await POST(post(path));

    expect(response.status).toBe(401);
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('lets an authenticated request reach the existing handler logic', async () => {
    mocks.requireAuth.mockResolvedValue({ user: { id: 'user-1', email: 'a@example.com' } });
    const { POST } = await import(/* @vite-ignore */ module);

    const response = await POST(post(path));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(401);
    expect(mocks.requireAuth).toHaveBeenCalled();
  });
});
