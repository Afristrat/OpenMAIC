/**
 * Ajoute au cours les étapes de capture validées : copie chaque capture d'écran dans le média du
 * cours, puis remplace en bloc les diapositives d'étape (identifiant stable `capture_<étape>`), de
 * sorte qu'un second passage ne les duplique jamais et retire celles dont l'étape n'est plus validée.
 * Les voix off restent à générer par « Générer les voix manquantes » du cours.
 */

import {
  buildCaptureStepScenes,
  CAPTURE_SCENE_PREFIX,
  type CaptureStepInput,
  type CaptureStepLocale,
} from '@/lib/capture/step-scenes';
import { createLogger } from '@/lib/logger';
import { persistClassroom, readClassroom } from '@/lib/server/classroom-storage';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const log = createLogger('CaptureStepScenes');

type SessionRow = {
  id: string;
  captured_at: string;
  supersedes_capture_id: string | null;
};

type StepRow = {
  id: string;
  position: number;
  action: CaptureStepInput['action'];
  url: string;
  element: CaptureStepInput['element'];
  pointer: CaptureStepInput['pointer'];
  viewport: { w?: number; h?: number } | null;
  description: string;
  screenshot_path: string | null;
};

export class CaptureStepScenesError extends Error {
  constructor(
    readonly code: 'NO_STAGE' | 'NO_STEPS' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
  }
}

function imageExtension(path: string): { extension: string; contentType: string } {
  return /\.jpe?g$/i.test(path)
    ? { extension: 'jpg', contentType: 'image/jpeg' }
    : { extension: 'png', contentType: 'image/png' };
}

/** Étapes validées, avec capture, des sessions encore valables, dans l'ordre de la procédure. */
async function loadApprovedSteps(courseId: string): Promise<StepRow[]> {
  const supabase = createServiceSupabaseClient();
  const { data: sessions, error } = await supabase
    .from('capture_sessions')
    .select('id, captured_at, supersedes_capture_id')
    .eq('course_id', courseId)
    .eq('status', 'complete')
    .order('captured_at', { ascending: true });
  if (error) throw new Error(`Failed to read capture sessions: ${error.message}`);

  const rows = (sessions ?? []) as SessionRow[];
  const replaced = new Set(
    rows.flatMap((session) =>
      session.supersedes_capture_id ? [session.supersedes_capture_id] : [],
    ),
  );
  const steps: StepRow[] = [];
  for (const session of rows.filter((candidate) => !replaced.has(candidate.id))) {
    const { data, error: stepsError } = await supabase
      .from('capture_steps')
      .select('id, position, action, url, element, pointer, viewport, description, screenshot_path')
      .eq('session_id', session.id)
      .eq('review', 'approved')
      .not('screenshot_path', 'is', null)
      .order('position', { ascending: true });
    if (stepsError) throw new Error(`Failed to read capture steps: ${stepsError.message}`);
    steps.push(...((data ?? []) as StepRow[]));
  }
  return steps;
}

export async function addCaptureStepsToCourse(input: {
  courseId: string;
  stageId: string | null;
  locale: CaptureStepLocale;
  baseUrl: string;
}): Promise<{ added: number; removed: number }> {
  if (!input.stageId) {
    throw new CaptureStepScenesError('NO_STAGE', "Ce projet n'a pas encore de cours généré.");
  }
  const classroom = await readClassroom(input.stageId);
  if (!classroom) throw new CaptureStepScenesError('NOT_FOUND', 'Cours introuvable.');

  const approved = await loadApprovedSteps(input.courseId);
  const supabase = createServiceSupabaseClient();

  const steps: CaptureStepInput[] = [];
  for (const [index, step] of approved.entries()) {
    const sourcePath = step.screenshot_path;
    if (!sourcePath) continue;
    const { data: image, error: downloadError } = await supabase.storage
      .from('capture-screenshots')
      .download(sourcePath);
    if (downloadError || !image) {
      log.warn(
        `Screenshot unavailable for step ${step.id}: ${downloadError?.message ?? 'no file'}`,
      );
      continue;
    }
    const { extension, contentType } = imageExtension(sourcePath);
    const mediaName = `capture-step-${step.id}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('classroom-media')
      .upload(`${input.stageId}/media/${mediaName}`, Buffer.from(await image.arrayBuffer()), {
        contentType,
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Failed to copy screenshot of step ${step.id}: ${uploadError.message}`);
    }
    steps.push({
      id: step.id,
      position: index,
      action: step.action,
      url: step.url,
      element: step.element,
      pointer: step.pointer,
      viewport: { w: step.viewport?.w ?? 1, h: step.viewport?.h ?? 1 },
      description: step.description,
      imageUrl: `/api/classroom-media/${input.stageId}/media/${mediaName}`,
    });
  }

  const previous = classroom.scenes.filter((scene) => scene.id.startsWith(CAPTURE_SCENE_PREFIX));
  const kept = classroom.scenes.filter((scene) => !scene.id.startsWith(CAPTURE_SCENE_PREFIX));
  if (steps.length === 0 && previous.length === 0) {
    throw new CaptureStepScenesError('NO_STEPS', 'Aucune étape validée avec capture.');
  }

  const agentId = kept
    .flatMap((scene) => scene.actions ?? [])
    .find((action) => action.type === 'speech' && action.agentId)?.agentId;
  const firstOrder = kept.reduce((highest, scene) => Math.max(highest, scene.order), 0) + 1;
  const created = buildCaptureStepScenes({
    stageId: input.stageId,
    steps,
    firstOrder,
    locale: input.locale,
    agentId,
  });

  if (previous.length > 0) {
    const { error: deleteError } = await supabase
      .from('scenes')
      .delete()
      .eq('stage_id', input.stageId)
      .in(
        'id',
        previous.map((scene) => scene.id),
      );
    if (deleteError) throw new Error(`Failed to replace capture scenes: ${deleteError.message}`);
  }

  await persistClassroom(
    {
      id: input.stageId,
      stage: classroom.stage,
      scenes: [...kept, ...created],
      ownerId: classroom.ownerId,
      orgId: classroom.orgId,
    },
    input.baseUrl,
  );
  return { added: created.length, removed: previous.length };
}
