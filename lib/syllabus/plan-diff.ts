import type { ClassroomPlan, ClassroomSyllabus, SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';

/** Champs d'une entrée du plan qui ne décrivent pas son contenu pédagogique : jamais une raison de régénérer. */
const NON_CONTENT_KEYS = new Set([
  'order',
  'generatedResources',
  'mediaGenerations',
  'resourceGenerations',
  'suggestedImageIds',
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Empreinte du contenu d'une entrée : deux entrées de même empreinte donnent la même scène. */
export function outlineSignature(outline: SceneOutline): string {
  const content: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(outline)) {
    if (!NON_CONTENT_KEYS.has(key)) content[key] = value;
  }
  return stableStringify(content);
}

export function syllabusSignature(syllabus: ClassroomSyllabus): string {
  return stableStringify(syllabus);
}

export interface PlanDiff {
  /** Entrées absentes de l'ancien plan : une scène est à générer. */
  added: SceneOutline[];
  /** Entrées de l'ancien plan absentes du nouveau : leur scène est à supprimer. */
  removed: SceneOutline[];
  /** Entrées dont le contenu a changé : leur scène est à régénérer. */
  modified: SceneOutline[];
  /** Entrées de contenu identique mais de rang différent : la scène est conservée et renumérotée. */
  moved: SceneOutline[];
  /** Entrées strictement inchangées. */
  unchanged: SceneOutline[];
}

export function sortByOrder(outlines: SceneOutline[]): SceneOutline[] {
  return [...outlines].sort((a, b) => a.order - b.order);
}

/** Renumérote 1..n dans l'ordre fourni, comme le fait l'éditeur de plan à chaque modification. */
export function normalizeOrder(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map((outline, index) => ({ ...outline, order: index + 1 }));
}

export function diffPlans(previous: SceneOutline[], next: SceneOutline[]): PlanDiff {
  const before = new Map(previous.map((outline) => [outline.id, outline]));
  const after = new Map(next.map((outline) => [outline.id, outline]));
  const diff: PlanDiff = { added: [], removed: [], modified: [], moved: [], unchanged: [] };

  for (const outline of sortByOrder(next)) {
    const old = before.get(outline.id);
    if (!old) diff.added.push(outline);
    else if (outlineSignature(old) !== outlineSignature(outline)) diff.modified.push(outline);
    else if (old.order !== outline.order) diff.moved.push(outline);
    else diff.unchanged.push(outline);
  }
  for (const outline of sortByOrder(previous)) {
    if (!after.has(outline.id)) diff.removed.push(outline);
  }
  return diff;
}

/** Nombre de scènes à (re)générer : ajoutées et modifiées. */
export function regenerationCount(diff: PlanDiff): number {
  return diff.added.length + diff.modified.length;
}

export function isPlanUnchanged(diff: PlanDiff): boolean {
  return regenerationCount(diff) === 0 && diff.removed.length === 0 && diff.moved.length === 0;
}

export interface ReconciledScenes {
  /** Entrées du nouveau plan qui portent une scène (conservée ou à générer), renumérotées 1..n. */
  outlines: SceneOutline[];
  /** Scènes conservées, renumérotées selon `outlines`. */
  keptScenes: Scene[];
  /** Entrées sans scène à générer : ajoutées ou modifiées. */
  pending: SceneOutline[];
  /** Entrées inchangées dont la scène a déjà été supprimée à la main : ignorées, jamais régénérées sans demande. */
  orphaned: SceneOutline[];
  /**
   * Anciennes scènes des entrées modifiées, renumérotées selon `outlines` : retirées de la salle pendant la
   * régénération, elles sont remises en place si celle-ci échoue, pour ne jamais perdre un contenu sans remplaçant.
   */
  replaced: Scene[];
}

/**
 * Applique un diff aux scènes existantes. Une scène se rattache à son entrée du plan par le rang (`order`),
 * comme le fait le magasin de scènes ; `sceneOrderOf` donne le rang réel de la scène d'une ancienne entrée
 * (par défaut, le rang de l'entrée elle-même).
 */
export function reconcileScenes(input: {
  previous: SceneOutline[];
  next: SceneOutline[];
  scenes: Scene[];
  sceneOrderOf?: (outline: SceneOutline) => number;
}): ReconciledScenes {
  const { previous, next, scenes } = input;
  const sceneOrderOf = input.sceneOrderOf ?? ((outline: SceneOutline) => outline.order);
  const diff = diffPlans(previous, next);
  const regenerateIds = new Set([...diff.added, ...diff.modified].map((outline) => outline.id));
  const sceneByOrder = new Map(scenes.map((scene) => [scene.order, scene]));
  const previousById = new Map(previous.map((outline) => [outline.id, outline]));

  const included: SceneOutline[] = [];
  const keptByOutlineId = new Map<string, Scene>();
  const replacedByOutlineId = new Map<string, Scene>();
  const modifiedIds = new Set(diff.modified.map((outline) => outline.id));
  const orphaned: SceneOutline[] = [];
  for (const outline of sortByOrder(next)) {
    if (regenerateIds.has(outline.id)) {
      included.push(outline);
      const old = modifiedIds.has(outline.id) ? previousById.get(outline.id) : undefined;
      const previousScene = old ? sceneByOrder.get(sceneOrderOf(old)) : undefined;
      if (previousScene) replacedByOutlineId.set(outline.id, previousScene);
      continue;
    }
    const old = previousById.get(outline.id);
    const scene = old ? sceneByOrder.get(sceneOrderOf(old)) : undefined;
    if (scene) {
      included.push(outline);
      keptByOutlineId.set(outline.id, scene);
    } else {
      orphaned.push(outline);
    }
  }

  const outlines = normalizeOrder(included);
  const keptScenes = outlines.flatMap((outline) => {
    const scene = keptByOutlineId.get(outline.id);
    return scene ? [{ ...scene, order: outline.order }] : [];
  });
  const replaced = outlines.flatMap((outline) => {
    const scene = replacedByOutlineId.get(outline.id);
    return scene ? [{ ...scene, order: outline.order }] : [];
  });
  const pending = outlines.filter((outline) => regenerateIds.has(outline.id));
  return { outlines, keptScenes, pending, orphaned, replaced };
}

/**
 * Vue d'un plan destinée à un apprenant ou à un visiteur : le programme et le déroulé, sans les directives de
 * conception, les rapports d'optimisation, ni les champs de génération des scènes (médias, ressources, configurations).
 */
export function toLearnerPlan(plan: ClassroomPlan): ClassroomPlan {
  return {
    courseTitle: plan.courseTitle,
    languageDirective: '',
    syllabus: plan.syllabus,
    outlines: sortByOrder(plan.outlines).map((outline) => ({
      id: outline.id,
      type: outline.type,
      title: outline.title,
      description: outline.description,
      keyPoints: outline.keyPoints,
      teachingObjective: outline.teachingObjective,
      estimatedDuration: outline.estimatedDuration,
      order: outline.order,
    })),
  };
}
