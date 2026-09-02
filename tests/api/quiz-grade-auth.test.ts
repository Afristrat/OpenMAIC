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

describe('POST /api/quiz-grade tenant boundary', () => {
  beforeEach(() => {
    mocks.callLLM.mockReset().mockResolvedValue({ text: '{"score":1,"comment":"ok"}' });
    mocks.requireOrgMember.mockReset();
    mocks.resolveModelFromRequest.mockReset().mockResolvedValue({ model: {} });
  });

  it('rejects an unscoped grading request before any provider call', async () => {
    const { POST } = await import('@/app/api/quiz-grade/route');
    const request = new Request('http://localhost/api/quiz-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Quelle est la capitale du Maroc ?',
        userAnswer: 'Rabat',
        points: 1,
        language: 'fr-FR',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(400);
    expect(mocks.requireOrgMember).not.toHaveBeenCalled();
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('runs grading inside the verified tenant context', async () => {
    const { nextUsageOperationContext } = await import('@/lib/billing/usage-context');
    let providerContext: ReturnType<typeof nextUsageOperationContext> = null;
    mocks.requireOrgMember.mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
    });
    mocks.callLLM.mockImplementation(async () => {
      providerContext = nextUsageOperationContext('quiz-grade', 'llm_input_token');
      return { text: '{"score":1,"comment":"ok"}' };
    });
    const { POST } = await import('@/app/api/quiz-grade/route');
    const request = new Request('http://localhost/api/quiz-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: 'org-1',
        question: 'Quelle est la capitale du Maroc ?',
        userAnswer: 'Rabat',
        points: 1,
        language: 'fr-FR',
      }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(providerContext).toMatchObject({ actorUserId: 'user-1', tenantId: 'org-1' });
  });
});
