import type { Stage } from '@/lib/types/stage';

/**
 * A course can only be completed by the server when it carries a voice casting: the teacher
 * profile or the generated agents. Older courses have neither, and the completion would refuse.
 */
export function hasVoiceCasting(
  stage: Pick<Stage, 'teacherProfile' | 'generatedAgentConfigs'> | null | undefined,
): boolean {
  return Boolean(stage?.teacherProfile) || (stage?.generatedAgentConfigs?.length ?? 0) > 0;
}
