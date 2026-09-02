import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'a@example.com' } }),
  requireOrgMember: vi.fn(),
  resolveModel: vi.fn().mockResolvedValue({
    model: {},
    apiKey: 'key',
    providerId: 'openai',
    thinkingConfig: undefined,
  }),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgMember: mocks.requireOrgMember,
}));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/orchestration/stateless-generate', () => ({
  statelessGenerate: async function* () {},
}));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(false) }));

describe('POST /api/chat tenant boundary', () => {
  it('rejects an unscoped live turn before model resolution', async () => {
    const { POST } = await import('@/app/api/chat/route');
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        storeState: {
          stage: null,
          scenes: [],
          currentSceneId: null,
          mode: 'lecture',
          whiteboardOpen: false,
        },
        config: { agentIds: ['teacher'] },
        apiKey: 'key',
        model: 'openai:test',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });
});
