import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireSuperAdminOrOrgAuthor: vi.fn(),
  resolveModelFromRequest: vi.fn(),
}));

vi.mock('@/lib/api/auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireAuth: mocks.requireAuth,
  requireSuperAdminOrOrgAuthor: mocks.requireSuperAdminOrOrgAuthor,
}));
vi.mock('@/lib/server/resolve-model', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveModelFromRequest: mocks.resolveModelFromRequest,
}));

const OUTLINE = { id: 'o1', type: 'slide', title: 'Titre', description: 'Description', order: 1 };

// Corps complets : la validation passe, seule l'authentification doit arrêter la requête.
const ROUTES = [
  [
    'generate/scene-content',
    '@/app/api/generate/scene-content/route',
    { outline: OUTLINE, allOutlines: [OUTLINE], stageId: 's1', orgId: 'org-1' },
  ],
  [
    'generate/scene-actions',
    '@/app/api/generate/scene-actions/route',
    { outline: OUTLINE, allOutlines: [OUTLINE], content: {}, stageId: 's1', orgId: 'org-1' },
  ],
  [
    'generate/agent-profiles',
    '@/app/api/generate/agent-profiles/route',
    {
      stageInfo: { name: 'Cours' },
      languageDirective: 'fr',
      availableAvatars: ['a.png'],
      orgId: 'org-1',
    },
  ],
] as const;

function post(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe.each(ROUTES)('POST /api/%s authentication', (path, module, body) => {
  beforeAll(async () => {
    await import(/* @vite-ignore */ module);
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveModelFromRequest.mockRejectedValue(new Error('model not configured'));
  });

  it('rejects an anonymous request with 401 before any model work', async () => {
    const denied = new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 });
    mocks.requireAuth.mockResolvedValue({ response: denied });
    mocks.requireSuperAdminOrOrgAuthor.mockResolvedValue({ response: denied });
    const { POST } = await import(/* @vite-ignore */ module);

    const response = await POST(post(path, body));

    expect(response.status).toBe(401);
    expect(mocks.requireSuperAdminOrOrgAuthor).toHaveBeenCalledWith(expect.anything(), 'org-1');
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('rejects a non-author with 403 before any model work', async () => {
    const forbidden = new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 });
    mocks.requireSuperAdminOrOrgAuthor.mockResolvedValue({ response: forbidden });
    const { POST } = await import(/* @vite-ignore */ module);

    const response = await POST(post(path, body));

    expect(response.status).toBe(403);
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });
});
