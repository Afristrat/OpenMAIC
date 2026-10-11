import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  running: vi.fn(),
  succeeded: vi.fn(),
  conflict: vi.fn(),
  failed: vi.fn(),
  step: vi.fn(),
  touch: vi.fn(),
}));

vi.mock('@/lib/server/classroom-plan-generation', () => ({
  generateClassroomPlan: mocks.generate,
}));
vi.mock('@/lib/server/classroom-plan-job-store', () => ({
  markClassroomPlanJobRunning: mocks.running,
  markClassroomPlanJobSucceeded: mocks.succeeded,
  markClassroomPlanJobConflict: mocks.conflict,
  markClassroomPlanJobFailed: mocks.failed,
  reportClassroomPlanStep: mocks.step,
  touchClassroomPlanJob: mocks.touch,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.step.mockResolvedValue(undefined);
    mocks.touch.mockResolvedValue(undefined);
  });

  it('persists a structured source conflict without publishing a syllabus', async () => {
    const alignment = {
      status: 'conflicting' as const,
      requestTopic: 'Gestion du temps',
      sourceTopic: 'Amélioration des processus',
      explanation: 'Les sujets diffèrent.',
      suggestedRequirement: 'Créer une formation sur Lean Six Sigma.',
      references: ['Lean Six Sigma et amélioration continue'],
    };
    mocks.generate.mockRejectedValue(new SourceMaterialConflictError(alignment));

    await runClassroomPlanJob('plan-conflict', input);

    expect(mocks.running).toHaveBeenCalledWith('plan-conflict');
    expect(mocks.conflict).toHaveBeenCalledWith('plan-conflict', alignment);
    expect(mocks.succeeded).not.toHaveBeenCalled();
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it('reports each plan step to the job and keeps the job alive while it runs', async () => {
    vi.useFakeTimers();
    try {
      mocks.generate.mockImplementation(
        async (
          _input: unknown,
          _owner: unknown,
          hooks: { onStep: (step: string) => Promise<void> },
        ) => {
          await hooks.onStep('designing_plan');
          await vi.advanceTimersByTimeAsync(45_000);
          return { courseTitle: 'Plan', outlines: [] };
        },
      );

      await runClassroomPlanJob('plan-steps', input);

      expect(mocks.step).toHaveBeenCalledWith('plan-steps', 'designing_plan');
      expect(mocks.touch).toHaveBeenCalledTimes(2);
      expect(mocks.succeeded).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.touch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
