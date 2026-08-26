import type { ClassroomSyllabus, SceneOutline } from '@/lib/types/generation';

export type SyllabusValidationIssue =
  | { field: 'audience' | 'prerequisites' | 'overallObjective' | 'learningObjectives' }
  | { field: 'deliveryMode' | 'assessmentStrategy' | 'expectedDeliverable' | 'totalDuration' }
  | {
      field: 'sceneTitle' | 'sceneDescription' | 'sceneObjective' | 'sceneDuration';
      sceneIndex: number;
    };

function isBlank(value: string | undefined): boolean {
  return !value?.trim();
}

export function getSyllabusValidationIssues(
  syllabus: ClassroomSyllabus,
  outlines: SceneOutline[],
): SyllabusValidationIssue[] {
  const issues: SyllabusValidationIssue[] = [];

  if (isBlank(syllabus.audience)) issues.push({ field: 'audience' });
  if (isBlank(syllabus.prerequisites)) issues.push({ field: 'prerequisites' });
  if (isBlank(syllabus.overallObjective)) issues.push({ field: 'overallObjective' });
  if (!syllabus.learningObjectives.some((objective) => !isBlank(objective))) {
    issues.push({ field: 'learningObjectives' });
  }
  if (!Number.isFinite(syllabus.totalDurationMinutes) || syllabus.totalDurationMinutes <= 0) {
    issues.push({ field: 'totalDuration' });
  }
  if (isBlank(syllabus.deliveryMode)) issues.push({ field: 'deliveryMode' });
  if (isBlank(syllabus.assessmentStrategy)) issues.push({ field: 'assessmentStrategy' });
  if (isBlank(syllabus.expectedDeliverable)) issues.push({ field: 'expectedDeliverable' });

  outlines.forEach((outline, sceneIndex) => {
    if (isBlank(outline.title)) issues.push({ field: 'sceneTitle', sceneIndex });
    if (isBlank(outline.description)) issues.push({ field: 'sceneDescription', sceneIndex });
    if (isBlank(outline.teachingObjective)) issues.push({ field: 'sceneObjective', sceneIndex });
    if (!outline.estimatedDuration || outline.estimatedDuration < 30) {
      issues.push({ field: 'sceneDuration', sceneIndex });
    }
  });

  return issues;
}
