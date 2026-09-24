import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const callLLM = vi.fn();
const requireOrgAuthor = vi.fn();
const organizationResult = vi.fn();

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

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => organizationResult() }),
      }),
    }),
  }),
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
    organizationResult.mockReset().mockResolvedValue({ data: { settings: {} }, error: null });
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
    expect(body.agents).toHaveLength(10);
    expect(
      new Set(body.agents.map((agent: { mechanismId: string }) => agent.mechanismId)).size,
    ).toBe(10);
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
    expect(prompt).toContain('exactly 10');
  });

  it('complète sans collision les mécanismes omis par le fournisseur', async () => {
    callLLM.mockResolvedValue({ text: llmAgents({}) });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.agents).toHaveLength(10);
    expect(body.agents.filter((agent: { role: string }) => agent.role === 'teacher')).toHaveLength(
      1,
    );
    expect(
      body.agents.every((agent: { name: string; avatar: string; voiceConfig: unknown }) =>
        Boolean(agent.name && agent.avatar && agent.voiceConfig),
      ),
    ).toBe(true);
  });

  it('conserve les identités configurées par le tenant en génération automatique', async () => {
    organizationResult.mockResolvedValue({
      data: {
        settings: {
          learningDesign: {
            personas: [
              {
                id: 'professor',
                defaultName: 'Hanae',
                gender: 'female',
                avatar: '/avatars/teacher-2.png',
                providerId: 'higgs-tts',
                voiceId: 'hanae',
              },
            ],
          },
        },
      },
      error: null,
    });
    callLLM.mockResolvedValue({ text: llmAgents({ mechanismId: 'professor' }) });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.agents[0]).toMatchObject({
      mechanismId: 'professor',
      name: 'Hanae',
      gender: 'female',
      voiceConfig: { providerId: 'higgs-tts', voiceId: 'hanae' },
    });
  });
});
