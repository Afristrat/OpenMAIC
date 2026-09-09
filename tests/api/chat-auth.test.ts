import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'user-1', email: 'a@example.com' } }),
  requireOrgMember: vi.fn(),
  readClassroomOwnership: vi.fn(),
  hasShareAccess: vi.fn(),
  enqueueInteraction: vi.fn(),
  readClassroomSkillPromptContext: vi.fn().mockResolvedValue(null),
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
vi.mock('@/lib/server/classroom-storage', () => ({
  persistInterventionDecision: vi.fn(),
  readClassroomOwnership: mocks.readClassroomOwnership,
  readClassroomSkillPromptContext: mocks.readClassroomSkillPromptContext,
}));
vi.mock('@/lib/orchestration/stateless-generate', () => ({
  statelessGenerate: async function* () {},
}));
vi.mock('@/lib/flags', () => ({ isFeatureEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/server/classroom-share-access', () => ({
  hasClassroomShareAccess: mocks.hasShareAccess,
}));
vi.mock('@/lib/jobs/queue', () => ({ enqueueClassroomInteraction: mocks.enqueueInteraction }));

describe('POST /api/chat tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readClassroomOwnership.mockResolvedValue(null);
    mocks.hasShareAccess.mockResolvedValue(false);
    mocks.readClassroomSkillPromptContext.mockResolvedValue(null);
  });

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

  it('derives the tenant from a persisted classroom for an older client', async () => {
    const denied = new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'owner-1', orgId: 'org-1' });
    mocks.requireOrgMember.mockResolvedValue({ response: denied });

    const { POST } = await import('@/app/api/chat/route');
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [],
        storeState: {
          stage: { id: 'persisted-classroom' },
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

    expect(response.status).toBe(401);
    expect(mocks.readClassroomOwnership).toHaveBeenCalledWith('persisted-classroom');
    expect(mocks.requireOrgMember).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'scopes shared discussion and its webhook to the recipient: %s',
    async (allowed) => {
      mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'author', orgId: 'source-org' });
      mocks.requireOrgMember.mockResolvedValue({
        user: { id: 'learner', email: 'learner@example.test' },
      });
      mocks.hasShareAccess.mockResolvedValue(allowed);
      mocks.readClassroomSkillPromptContext.mockResolvedValue({ orgId: 'source-org' });
      const { POST } = await import('@/app/api/chat/route');
      const response = await POST(
        new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orgId: 'recipient-org',
            messages: [
              {
                id: 'message-1',
                role: 'user',
                metadata: { originalRole: 'user' },
                parts: [{ type: 'text', text: 'Question' }],
              },
            ],
            storeState: {
              stage: { id: 'shared-stage' },
              scenes: [],
              currentSceneId: null,
              mode: 'lecture',
            },
            config: { agentIds: ['teacher'] },
            model: 'openai:test',
          }),
        }) as unknown as NextRequest,
      );
      expect(response.status).toBe(allowed ? 200 : 403);
      await response.text();
      if (allowed)
        expect(mocks.enqueueInteraction).toHaveBeenCalledWith(
          expect.objectContaining({ orgId: 'recipient-org' }),
        );
      else {
        expect(mocks.enqueueInteraction).not.toHaveBeenCalled();
        expect(mocks.resolveModel).not.toHaveBeenCalled();
      }
    },
  );
});
