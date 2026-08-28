import { buildLanguageDirective } from '@/lib/constants/generation';
import { parseImportCanvas, type SupportedCourseLanguage } from './import-canvas-validator';
import type { ClassroomPlan, SceneOutline } from '@/lib/types/generation';

function limit(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function keyPoints(content: string): string[] {
  const parts = content
    .split(/(?:\r?\n|(?<=[.!?؟])\s+)/)
    .map((part) => part.replace(/^[-*+]\s+/, '').trim())
    .filter(Boolean);
  return (parts.length > 0 ? parts : [content]).slice(0, 12).map((part) => limit(part, 1000));
}

function localizedDefaults(language: SupportedCourseLanguage) {
  if (language === 'ar-MA') {
    return {
      deliveryMode: 'فصل افتراضي تفاعلي',
      assessmentStrategy: 'تطبيقات عملية مع دليل إنجاز نهائي',
      finalTitle: 'دليل التطبيق النهائي',
    };
  }
  if (language === 'en-US') {
    return {
      deliveryMode: 'Interactive virtual classroom',
      assessmentStrategy: 'Practical checkpoints and final application evidence',
      finalTitle: 'Final application evidence',
    };
  }
  return {
    deliveryMode: 'Classe virtuelle interactive',
    assessmentStrategy: 'Mises en pratique et preuve finale d’application',
    finalTitle: 'Preuve finale d’application',
  };
}

export function importCanvasToClassroomPlan(
  text: string,
  language: SupportedCourseLanguage,
): ClassroomPlan {
  const canvas = parseImportCanvas(text);
  if (!canvas) throw new Error('A conforming import canvas is required to build a classroom plan');
  const defaults = localizedDefaults(language);
  const languageDirective = buildLanguageDirective(language);
  const chapterOutlines: SceneOutline[] = canvas.chapters.map((chapter, index) => ({
    id: `import-chapter-${index + 1}`,
    type: 'slide',
    title: limit(chapter.title, 300),
    description: limit(`${chapter.objective}\n\n${chapter.practice}`, 4000),
    keyPoints: keyPoints(chapter.essentialContent),
    teachingObjective: limit(chapter.objective, 1000),
    estimatedDuration: 25 * 60,
    order: index + 1,
    languageNote: languageDirective,
  }));
  const finalOutline: SceneOutline = {
    id: 'import-final-evidence',
    type: 'slide',
    title: defaults.finalTitle,
    description: limit(canvas.finalEvidence, 4000),
    keyPoints: keyPoints(canvas.finalEvidence),
    teachingObjective: limit(canvas.outcome, 1000),
    estimatedDuration: 15 * 60,
    order: chapterOutlines.length + 1,
    languageNote: languageDirective,
  };

  return {
    courseTitle: limit(canvas.title, 300),
    languageDirective,
    syllabus: {
      audience: limit(canvas.audience, 2000),
      prerequisites: limit(canvas.audience, 2000),
      overallObjective: limit(canvas.outcome, 2000),
      learningObjectives: canvas.chapters
        .slice(0, 12)
        .map((chapter) => limit(chapter.objective, 1000)),
      totalDurationMinutes: canvas.chapters.length * 25 + 15,
      deliveryMode: defaults.deliveryMode,
      assessmentStrategy: limit(
        `${defaults.assessmentStrategy}. ${canvas.chapters.map((chapter) => chapter.practice).join(' ')}`,
        2000,
      ),
      expectedDeliverable: limit(canvas.finalEvidence, 2000),
    },
    outlines: [...chapterOutlines, finalOutline],
  };
}
