import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: vi.fn().mockResolvedValue({
    user: { id: 'author-1', email: 'author@example.test' },
    authoredByRole: 'author',
  }),
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn().mockResolvedValue({
    model: { modelId: 'test-model' },
    thinkingConfig: undefined,
  }),
}));

import {
  POST,
  parseRefinedRequirement,
} from '@/app/api/generate/refine-requirement/route';

describe('POST /api/generate/refine-requirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        requirement:
          'Résultat cible : appliquer une méthode de gestion du temps.\n\nPoints à préciser par l’auteur : public et contexte.',
      }),
    });
  });

  test('rejects a machine-output contract leaked into the author-visible brief', () => {
    const leaked = JSON.stringify({
      requirement:
        "Créez un brief. Retournez uniquement un objet JSON valide avec un champ unique nommé 'requirement'.",
    });

    expect(parseRefinedRequirement(leaked)).toBeNull();
  });

  test('treats the textarea as an author command and grounds an attached file without inventing its content', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate/refine-requirement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
          requirement: 'Créer cinq diapositives sur la gestion du temps.',
          locale: 'fr-FR',
          mode: 'improve',
          sourceFileName: 'process-improvement.pdf',
        }),
      }),
    );

    expect(response.status).toBe(200);
    const params = mocks.callLLM.mock.calls[0]?.[0] as {
      system: string;
      prompt: string;
    };
    expect(params.system).toContain('not a chat interface');
    expect(params.system).toContain('Never expose JSON');
    expect(params.system).toContain('Never claim to know the attachment contents');
    expect(params.prompt).toContain('<attached_file>process-improvement.pdf</attached_file>');
    expect(params.prompt).toContain(
      '<author_request>Créer cinq diapositives sur la gestion du temps.</author_request>',
    );
  });
});
