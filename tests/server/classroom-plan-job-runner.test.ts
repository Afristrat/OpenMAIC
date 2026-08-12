import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  running: vi.fn(),
  succeeded: vi.fn(),
  conflict: vi.fn(),
  failed: vi.fn(),
}));

vi.mock('@/lib/server/classroom-plan-generation', () => ({
  generateClassroomPlan: mocks.generate,
}));
vi.mock('@/lib/server/classroom-plan-job-store', () => ({
  markClassroomPlanJobRunning: mocks.running,
  markClassroomPlanJobSucceeded: mocks.succeeded,
  markClassroomPlanJobConflict: mocks.conflict,
  markClassroomPlanJobFailed: mocks.failed,
}));

import { runClassroomPlanJob } from '@/lib/server/classroom-plan-job-runner';
import { SourceMaterialConflictError } from '@/lib/server/source-material-alignment';

const input = {
  orgId: 'org-1',
  authorRole: 'author' as const,
  requirement: 'Formation fondée sur le document',
  learningApproach: 'andragogy' as const,
  interactionLevel: 'balanced' as const,
};

describe('classroom plan worker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists a structured source conflict without publishing a syllabus', async () => {
    const alignment = {
      status: 'conflicting' as const,
      requestTopic: 'Gestion du temps',
      sourceTopic: 'Amélioration des processus',
      explanation: 'Les sujets diffèrent.',
    };
    mocks.generate.mockRejectedValue(new SourceMaterialConflictError(alignment));

    await runClassroomPlanJob('plan-conflict', input);

    expect(mocks.running).toHaveBeenCalledWith('plan-conflict');
    expect(mocks.conflict).toHaveBeenCalledWith('plan-conflict', alignment);
    expect(mocks.succeeded).not.toHaveBeenCalled();
    expect(mocks.failed).not.toHaveBeenCalled();
  });
});
