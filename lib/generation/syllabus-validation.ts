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

export interface SyllabusDurationGap {
  sequencesMinutes: number;
  totalMinutes: number;
}

/**
 * Gap between the announced total duration and the sum of the sequences, or null when they
 * agree within the tolerance. Informative only: it never blocks the author's validation.
 */
/**
 * Rescales every sequence so that together they last exactly `totalMinutes`,
 * keeping their relative weights. A sequence without a duration gets an average one.
 */
export function redistributeSceneDurations(
  outlines: SceneOutline[],
  totalMinutes: number,
): SceneOutline[] {
  if (outlines.length === 0 || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return outlines;
  const targetSeconds = Math.round(totalMinutes * 60);
  const known = outlines.map((outline) => outline.estimatedDuration ?? 0);
  const knownTotal = known.reduce((sum, value) => sum + value, 0);
  const knownCount = known.filter((value) => value > 0).length;
  const average = knownCount > 0 ? knownTotal / knownCount : 1;
  const weights = known.map((value) => (value > 0 ? value : average));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const scaled = weights.map((weight) =>
    Math.min(7200, Math.max(1, Math.round((weight * targetSeconds) / weightTotal))),
  );
  const drift = targetSeconds - scaled.reduce((sum, value) => sum + value, 0);
  const longest = scaled.indexOf(Math.max(...scaled));
  scaled[longest] = Math.min(7200, Math.max(1, scaled[longest] + drift));
  return outlines.map((outline, index) => ({ ...outline, estimatedDuration: scaled[index] }));
}

export function getSyllabusDurationGap(
  syllabus: ClassroomSyllabus,
  outlines: SceneOutline[],
  tolerance = 0.1,
): SyllabusDurationGap | null {
  const totalMinutes = syllabus.totalDurationMinutes;
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0 || outlines.length === 0) return null;
  const seconds = outlines.reduce((sum, outline) => sum + (outline.estimatedDuration ?? 0), 0);
  const sequencesMinutes = Math.round(seconds / 60);
  if (Math.abs(sequencesMinutes - totalMinutes) <= totalMinutes * tolerance) return null;
  return { sequencesMinutes, totalMinutes };
}
