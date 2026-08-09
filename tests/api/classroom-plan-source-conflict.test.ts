import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateClassroomPlan: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: vi.fn().mockResolvedValue({
    user: { id: 'author-1', email: 'author@example.test' },
    authoredByRole: 'author',
  }),
}));

vi.mock('@/lib/server/classroom-plan-generation', () => ({
  generateClassroomPlan: mocks.generateClassroomPlan,
}));

import { POST } from '@/app/api/generate-classroom/plan/route';
import { SourceMaterialConflictError } from '@/lib/server/source-material-alignment';

const body = {
  orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
  requirement: 'Créer cinq diapositives sur la gestion du temps.',
  learningApproach: 'andragogy',
  interactionLevel: 'balanced',
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
  pdfContent: { text: 'Process improvement and Lean Six Sigma.', images: [] },
};

describe('POST /api/generate-classroom/plan source conflict', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateClassroomPlan.mockRejectedValue(
      new SourceMaterialConflictError({
        status: 'conflicting',
        requestTopic: 'Gestion du temps',
        sourceTopic: 'Amélioration des processus',
        explanation: 'La demande et le document portent sur deux sujets différents.',
      }),
    );
  });

  test('returns a structured 409 and no syllabus', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate-classroom/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(409);
    expect(result).toEqual({
      success: false,
      errorCode: 'SOURCE_MATERIAL_CONFLICT',
      error: 'La demande et le document joint ne sont pas cohérents.',
      sourceAlignment: {
        status: 'conflicting',
        requestTopic: 'Gestion du temps',
        sourceTopic: 'Amélioration des processus',
        explanation: 'La demande et le document portent sur deux sujets différents.',
      },
    });
    expect(result).not.toHaveProperty('syllabus');
    expect(result).not.toHaveProperty('outlines');
  });
});
