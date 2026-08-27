import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: vi.fn().mockResolvedValue({
    user: { id: 'author-1', email: 'author@example.test' },
    authoredByRole: 'author',
  }),
}));

vi.mock('@/lib/server/classroom-plan-job-store', () => ({
  createClassroomPlanJob: mocks.createJob,
  markClassroomPlanJobFailed: vi.fn(),
}));

vi.mock('@/lib/jobs/queue', () => ({ enqueueClassroomPlan: mocks.enqueue }));

import { POST } from '@/app/api/generate-classroom/plan/route';

const body = {
  orgId: '432f141e-f1d3-4ed9-bad3-6768100802a4',
  requirement: 'Créer cinq diapositives sur la gestion du temps.',
  learningApproach: 'andragogy',
  interactionLevel: 'balanced',
  learningContext: { territory: 'Maroc', currencyCode: 'MAD' },
  pdfContent: { text: 'Process improvement and Lean Six Sigma.', images: [] },
  agentVoiceOverrides: {
    assistant: { providerId: 'higgs-tts', modelId: 'higgs', voiceId: 'hanae' },
  },
};

describe('POST /api/generate-classroom/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createJob.mockImplementation(async (jobId: string) => ({
      id: jobId,
      status: 'queued',
    }));
    mocks.enqueue.mockResolvedValue('bull-plan-job');
  });

  test('persists and queues the plan instead of generating it in the HTTP request', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/generate-classroom/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(202);
    expect(result).toMatchObject({
      success: true,
      status: 'queued',
      pollIntervalMs: 30_000,
    });
    expect(result.jobId).toMatch(/^plan-/);
    expect(mocks.createJob).toHaveBeenCalledWith(
      result.jobId,
      expect.objectContaining({
        orgId: body.orgId,
        requirement: body.requirement,
        pdfContent: body.pdfContent,
        agentVoiceOverrides: body.agentVoiceOverrides,
      }),
      'author-1',
    );
    expect(mocks.enqueue).toHaveBeenCalledWith({ jobId: result.jobId });
  });
});
