import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgEditor: vi.fn().mockResolvedValue({
    user: { id: 'author-1', email: 'author@example.test' },
  }),
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: vi.fn().mockReturnValue(true),
  readClassroomOwnership: vi.fn().mockResolvedValue({
    orgId: 'org-1',
    ownerId: 'author-1',
  }),
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn().mockResolvedValue({
    model: { modelId: 'test-model' },
    thinkingConfig: undefined,
  }),
}));

import { POST } from '@/app/api/generate/editor-image-brief/route';

describe('POST /api/generate/editor-image-brief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        prompt:
          'Infographie horizontale en cinq blocs reliés par un flux net, pictogrammes sobres et hiérarchie visuelle immédiate.',
        negativePrompt: 'personnage, photographie, texte minuscule, filigrane, surcharge',
      }),
    });
  });

  test('retourne un brief sémantique éditable pour une classroom autorisée', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate/editor-image-brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-model': 'test-model' },
        body: JSON.stringify({
          classroomId: 'VGno4ktq3G',
          sceneTitle: 'Le SIPOC',
          transcript:
            'Le SIPOC comporte cinq colonnes. Reliez les fournisseurs aux entrées puis aux sorties.',
          targetContext: 'Remplacement d’une image.',
          target: { width: 720, height: 260 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.prompt).toContain('cinq blocs reliés');
    expect(payload.negativePrompt).toContain('personnage');
  });

  test('refuse un brief qui recopie la narration', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        prompt:
          'Image avec le texte le SIPOC comporte cinq colonnes reliez les fournisseurs aux entrées puis aux sorties',
        negativePrompt: 'filigrane',
      }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/generate/editor-image-brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          classroomId: 'VGno4ktq3G',
          sceneTitle: 'Le SIPOC',
          transcript:
            'Le SIPOC comporte cinq colonnes. Reliez les fournisseurs aux entrées puis aux sorties.',
          targetContext: 'Remplacement d’une image.',
          target: { width: 720, height: 260 },
        }),
      }),
    );

    expect(response.status).toBe(502);
  });
});
