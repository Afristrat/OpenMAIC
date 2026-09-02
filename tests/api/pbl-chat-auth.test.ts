import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  requireOrgMember: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/api/auth', () => ({ requireOrgMember: mocks.requireOrgMember }));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function request(orgId?: string) {
  return new Request('http://localhost/api/pbl/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(orgId ? { orgId } : {}),
      message: 'Aide-moi à comprendre le problème.',
      agent: { name: 'Mentor', system_prompt: 'Aide l’apprenant.' },
      currentIssue: null,
      recentMessages: [],
      userRole: 'learner',
    }),
  }) as unknown as NextRequest;
}

describe('POST /api/pbl/chat tenant boundary', () => {
  beforeEach(() => {
    mocks.callLLM.mockReset().mockResolvedValue({ text: 'Réponse' });
    mocks.requireOrgMember.mockReset().mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
    });
    mocks.resolveModelFromRequest.mockReset().mockResolvedValue({ model: {} });
  });

  it('rejects an unscoped chat before any provider call', async () => {
    const { POST } = await import('@/app/api/pbl/chat/route');
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('runs the chat inside the verified tenant context', async () => {
    const { nextUsageOperationContext } = await import('@/lib/billing/usage-context');
    let providerContext: ReturnType<typeof nextUsageOperationContext> = null;
    mocks.callLLM.mockImplementation(async () => {
      providerContext = nextUsageOperationContext('pbl-chat', 'llm_input_token');
      return { text: 'Réponse' };
    });
    const { POST } = await import('@/app/api/pbl/chat/route');

    const response = await POST(request('org-1'));

    expect(response.status).toBe(200);
    expect(providerContext).toMatchObject({ actorUserId: 'user-1', tenantId: 'org-1' });
  });
});
