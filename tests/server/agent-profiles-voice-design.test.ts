import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const callLLM = vi.fn();
const requireOrgAuthor = vi.fn();

vi.mock('@/lib/ai/llm', () => ({
  callLLM: (...args: unknown[]) => callLLM(...args),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: async () => ({
    model: {},
    modelString: 'test-model',
    thinkingConfig: undefined,
  }),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: (...args: unknown[]) => requireOrgAuthor(...args),
}));

import { POST } from '@/app/api/generate/agent-profiles/route';

function makeRequest(includeOrgId = true): NextRequest {
  return new NextRequest('http://localhost/api/generate/agent-profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(includeOrgId ? { orgId: 'org-1' } : {}),
      stageInfo: { name: 'Intro to Algebra' },
      languageDirective: 'Respond in English.',
      availableAvatars: ['/a.png', '/b.png'],
    }),
  });
}

function llmAgents(extra: Record<string, unknown>) {
  return JSON.stringify({
    agents: [
      {
        name: 'Prof. Lin',
        role: 'teacher',
        persona: 'A patient mentor.',
        avatar: '/a.png',
        color: '#111111',
        priority: 10,
        ...extra,
      },
      {
        name: 'Sam',
        role: 'student',
        persona: 'Curious learner.',
        avatar: '/b.png',
        color: '#222222',
        priority: 5,
      },
    ],
  });
}

describe('agent-profiles route — voiceDesign', () => {
  beforeEach(() => {
    callLLM.mockReset();
    requireOrgAuthor.mockReset().mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
      authoredByRole: 'author',
    });
  });

  it('rejects profile generation without a tenant before the provider call', async () => {
    const response = await POST(makeRequest(false));

    expect(response.status).toBe(400);
    expect(requireOrgAuthor).not.toHaveBeenCalled();
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('attaches a normalized voiceDesign when the LLM emits one', async () => {
    callLLM.mockResolvedValue({
      text: llmAgents({
        voiceDesign: { identity: 'older male teacher', texture: 'warm low', delivery: 'calm' },
      }),
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.agents[0].voiceDesign).toEqual({
      identity: 'older male teacher',
      texture: 'warm low',
      delivery: 'calm',
    });
  });

  it('omits voiceDesign when the LLM does not emit one', async () => {
    callLLM.mockResolvedValue({ text: llmAgents({}) });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.agents[0]).not.toHaveProperty('voiceDesign');
  });

  it('instructs the LLM to keep voiceDesign gender consistent with the agent name', async () => {
    callLLM.mockResolvedValue({ text: llmAgents({}) });

    await POST(makeRequest());

    const prompt = callLLM.mock.calls[0][0].prompt as string;
    expect(prompt.toLowerCase()).toContain('gender');
    expect(prompt.toLowerCase()).toContain('name');
  });
});
