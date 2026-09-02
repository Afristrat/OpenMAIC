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
});
