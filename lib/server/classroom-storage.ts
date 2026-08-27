import path from 'path';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import type { Scene, Stage } from '@/lib/types/stage';
import type { Slide } from '@openmaic/dsl';
import {
  parseAnimationConstitution,
  type AnimationConstitution,
  type InterventionDecision,
} from '@/lib/formation-engine/animation-constitution';
import { normalizeClassroomCasting } from '@/lib/agents/classroom-casting';
export { buildRequestOrigin } from '@/lib/server/request-origin';

const log = createLogger('ClassroomStorage');

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  ownerId: string;
  orgId: string;
}

export interface ClassroomListItem {
  id: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
  thumbnail?: Slide;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

// Shared extension → content-type mapping for classroom media, used both when
// uploading to the `classroom-media` Storage bucket and when streaming it
// back out through the proxy route.
export const CLASSROOM_MEDIA_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function classroomMediaContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return CLASSROOM_MEDIA_MIME_TYPES[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Persistence — public.stages / public.scenes (Postgres), replacing the
// former per-classroom JSON file on local disk (did not survive redeploys).
// `extra` JSONB carries the @openmaic/dsl fields with no normalized column
// (see 00023_classroom_generated_persistence.sql). Written and read only via
// the service-role client: authorization is enforced by the calling API
// route (requireSuperAdminOrOrgAdmin / requireSuperAdminOrOrgMember), not by
// RLS on this path.
// ---------------------------------------------------------------------------

export interface StageExtra {
  createdAt?: number;
  updatedAt?: number;
  languageDirective?: string;
  skillPromptContext?: Stage['skillPromptContext'];
  learningContext?: Stage['learningContext'];
  researchSources?: Stage['researchSources'];
  whiteboard?: Stage['whiteboard'];
  videoManifest?: Stage['videoManifest'];
  generatedAgentConfigs?: Stage['generatedAgentConfigs'];
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
  teacherProfile?: Stage['teacherProfile'];
  animationConstitution?: AnimationConstitution;
}

interface SceneExtra {
  createdAt?: number;
  updatedAt?: number;
  whiteboards?: Scene['whiteboards'];
  multiAgent?: Scene['multiAgent'];
  sourceGrounding?: Scene['sourceGrounding'];
}

export function buildStageExtra(
  stage: Stage,
  animationConstitution?: AnimationConstitution,
): StageExtra {
  return {
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    languageDirective: stage.languageDirective,
    skillPromptContext: stage.skillPromptContext,
    learningContext: stage.learningContext,
    researchSources: stage.researchSources,
    whiteboard: stage.whiteboard,
    videoManifest: stage.videoManifest,
    generatedAgentConfigs: stage.generatedAgentConfigs,
    interactiveMode: stage.interactiveMode,
    taskEngineMode: stage.taskEngineMode,
    teacherProfile: stage.teacherProfile,
    animationConstitution,
  };
}

export function preserveAnimationConstitution(
  provided: AnimationConstitution | undefined,
  existing: AnimationConstitution | undefined,
): AnimationConstitution | undefined {
  return provided ?? existing;
}

export function extractStageLiveContext(extra: unknown): {
  context?: Stage['skillPromptContext'];
  animationConstitution?: AnimationConstitution;
} {
  const candidate = (extra ?? {}) as StageExtra;
  const parsed = parseAnimationConstitution(candidate.animationConstitution);
  return {
    context: candidate.skillPromptContext,
    animationConstitution: parsed.success ? parsed.constitution : undefined,
  };
}

export function buildSceneExtra(scene: Scene): SceneExtra {
  return {
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    whiteboards: scene.whiteboards,
    multiAgent: scene.multiAgent,
    sourceGrounding: scene.sourceGrounding,
  };
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    ownerId: string;
    orgId: string;
    animationConstitution?: AnimationConstitution;
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const supabase = createServiceSupabaseClient();
  const casting = normalizeClassroomCasting(data.stage, data.scenes);
  const stage = casting?.stage ?? data.stage;
  const scenes = casting?.scenes ?? data.scenes;
  const existingLiveContext =
    data.animationConstitution === undefined
      ? await readClassroomSkillPromptContext(data.id)
      : null;
  const animationConstitution = preserveAnimationConstitution(
    data.animationConstitution,
    existingLiveContext?.animationConstitution,
  );

  const { error: stageError } = await supabase.from('stages').upsert({
    id: data.id,
    owner_id: data.ownerId,
    org_id: data.orgId,
    name: stage.name,
    description: stage.description ?? null,
    style: stage.style ?? null,
    agent_ids: stage.agentIds ?? null,
    extra: buildStageExtra(stage, animationConstitution),
  });
  if (stageError) {
    throw new Error(`Failed to persist stage ${data.id}: ${stageError.message}`);
  }

  if (scenes.length > 0) {
    const { error: scenesError } = await supabase.from('scenes').upsert(
      scenes.map((scene) => ({
        id: scene.id,
        stage_id: data.id,
        type: scene.type,
        title: scene.title,
        order: scene.order,
        content: scene.content,
        actions: scene.actions ?? null,
        extra: buildSceneExtra(scene),
      })),
    );
    if (scenesError) {
      throw new Error(`Failed to persist scenes for stage ${data.id}: ${scenesError.message}`);
    }
  }

  const persisted = await readClassroom(data.id);
  if (!persisted) {
    throw new Error(`Persisted classroom ${data.id} could not be re-read`);
  }

  return { ...persisted, url: `${baseUrl}/classroom/${data.id}` };
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const supabase = createServiceSupabaseClient();

  const { data: stageRow, error: stageError } = await supabase
    .from('stages')
    .select('id, owner_id, org_id, name, description, style, agent_ids, extra, created_at')
    .eq('id', id)
    .maybeSingle();

  if (stageError) {
    throw new Error(`Failed to read stage ${id}: ${stageError.message}`);
  }
  if (!stageRow) return null;

  const { data: sceneRows, error: scenesError } = await supabase
    .from('scenes')
    .select('id, stage_id, type, title, order, content, actions, extra')
    .eq('stage_id', id)
    .order('order', { ascending: true });

  if (scenesError) {
    throw new Error(`Failed to read scenes for stage ${id}: ${scenesError.message}`);
  }

  // `extra` is our own JSONB, written exclusively by persistClassroom above —
  // trusted round-trip, not third-party input. Same trust boundary the
  // pre-migration code applied to the whole file via `JSON.parse(...) as`.
  const stageExtra = (stageRow.extra ?? {}) as StageExtra;

  const stage: Stage = {
    id: stageRow.id,
    name: stageRow.name,
    description: stageRow.description ?? undefined,
    createdAt: stageExtra.createdAt ?? new Date(stageRow.created_at).getTime(),
    updatedAt: stageExtra.updatedAt ?? new Date(stageRow.created_at).getTime(),
    languageDirective: stageExtra.languageDirective,
    skillPromptContext: stageExtra.skillPromptContext,
    learningContext: stageExtra.learningContext,
    researchSources: stageExtra.researchSources,
    style: stageRow.style ?? undefined,
    whiteboard: stageExtra.whiteboard,
    videoManifest: stageExtra.videoManifest,
    agentIds: stageRow.agent_ids ?? undefined,
    generatedAgentConfigs: stageExtra.generatedAgentConfigs,
    interactiveMode: stageExtra.interactiveMode,
    taskEngineMode: stageExtra.taskEngineMode,
    teacherProfile: stageExtra.teacherProfile,
  };

  const scenes: Scene[] = (sceneRows ?? []).map((row) => {
    const sceneExtra = (row.extra ?? {}) as SceneExtra;
    return {
      id: row.id,
      stageId: row.stage_id,
      type: row.type,
      title: row.title,
      order: row.order,
      content: row.content,
      actions: row.actions ?? undefined,
      whiteboards: sceneExtra.whiteboards,
      multiAgent: sceneExtra.multiAgent,
      sourceGrounding: sceneExtra.sourceGrounding,
      createdAt: sceneExtra.createdAt,
      updatedAt: sceneExtra.updatedAt,
    } as Scene;
  });

  return {
    id: stageRow.id,
    stage,
    scenes,
    createdAt: new Date(stageRow.created_at).toISOString(),
    ownerId: stageRow.owner_id,
    orgId: stageRow.org_id,
  };
}

/** Read the server-owned live prompt context without reconstructing all scenes. */
export async function readClassroomSkillPromptContext(id: string): Promise<{
  orgId: string;
  context?: Stage['skillPromptContext'];
  animationConstitution?: AnimationConstitution;
  generatedAgentConfigs?: Stage['generatedAgentConfigs'];
} | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('stages')
    .select('org_id, extra')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read skill prompt context for stage ${id}: ${error.message}`);
  }
  if (!data) return null;

  const liveContext = extractStageLiveContext(data.extra);
  return {
    orgId: data.org_id,
    ...liveContext,
    generatedAgentConfigs: ((data.extra ?? {}) as StageExtra).generatedAgentConfigs,
  };
}

export async function persistInterventionDecision(
  decision: InterventionDecision,
  orgId: string,
  learnerUserId: string,
): Promise<void> {
  const { error } = await createServiceSupabaseClient()
    .from('classroom_intervention_decisions')
    .upsert(
      {
        decision_id: decision.decisionId,
        classroom_id: decision.classroomId,
        org_id: orgId,
        learner_user_id: learnerUserId,
        interaction_id: decision.interactionId,
        scene_id: decision.sceneId,
        turn_index: decision.turnIndex,
        agent_id: decision.agentId,
        agent_name: decision.agentName,
        trigger: decision.trigger,
        form: decision.form,
        reason: decision.reason,
      },
      { onConflict: 'decision_id' },
    );
  if (error) {
    throw new Error(`Failed to persist intervention decision: ${error.message}`);
  }
}

export async function listClassrooms(orgId: string): Promise<ClassroomListItem[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, description, created_at, extra, scenes(count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list classrooms for org ${orgId}: ${error.message}`);

  const stageIds = (data ?? []).map((row) => row.id);
  const firstSlides = new Map<string, Slide>();
  if (stageIds.length > 0) {
    const { data: sceneRows, error: scenesError } = await supabase
      .from('scenes')
      .select('stage_id, content, order')
      .in('stage_id', stageIds)
      .eq('type', 'slide')
      .order('order', { ascending: true });
    if (scenesError) {
      throw new Error(
        `Failed to list classroom thumbnails for org ${orgId}: ${scenesError.message}`,
      );
    }
    for (const scene of sceneRows ?? []) {
      if (firstSlides.has(scene.stage_id)) continue;
      const content = scene.content as { type?: string; canvas?: Slide } | null;
      if (content?.type === 'slide' && content.canvas) {
        firstSlides.set(scene.stage_id, content.canvas);
      }
    }
  }

  return (data ?? []).map((row) => {
    const extra = (row.extra ?? {}) as StageExtra;
    const scenes = row.scenes as Array<{ count: number }> | null;
    const createdAt = new Date(row.created_at).getTime();
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      sceneCount: scenes?.[0]?.count ?? 0,
      createdAt: extra.createdAt ?? createdAt,
      updatedAt: extra.updatedAt ?? createdAt,
      interactiveMode: extra.interactiveMode,
      taskEngineMode: extra.taskEngineMode,
      thumbnail: firstSlides.get(row.id),
    };
  });
}

export async function renameClassroom(id: string, name: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: readError } = await supabase
    .from('stages')
    .select('extra')
    .eq('id', id)
    .maybeSingle();
  if (readError)
    throw new Error(`Failed to read classroom ${id} before renaming: ${readError.message}`);
  if (!existing) throw new Error(`Classroom ${id} does not exist`);

  const { error } = await supabase
    .from('stages')
    .update({ name, extra: { ...((existing.extra ?? {}) as StageExtra), updatedAt: Date.now() } })
    .eq('id', id);
  if (error) throw new Error(`Failed to rename classroom ${id}: ${error.message}`);
}

async function listClassroomMediaPaths(prefix: string): Promise<string[]> {
  const bucket = createServiceSupabaseClient().storage.from('classroom-media');
  const { data, error } = await bucket.list(prefix, { limit: 1000 });
  if (error) throw new Error(`Failed to list classroom media at ${prefix}: ${error.message}`);

  const paths = await Promise.all(
    (data ?? []).map(async (entry) => {
      const entryPath = `${prefix}/${entry.name}`;
      return entry.id === null ? listClassroomMediaPaths(entryPath) : [entryPath];
    }),
  );
  return paths.flat();
}

export async function deleteClassroom(id: string): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const mediaPaths = await listClassroomMediaPaths(id);
  const { error: mediaError } = mediaPaths.length
    ? await supabase.storage.from('classroom-media').remove(mediaPaths)
    : { error: null };
  if (mediaError) throw new Error(`Failed to delete classroom media ${id}: ${mediaError.message}`);
  const { error } = await supabase.from('stages').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete classroom ${id}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Diagnostic helper: fetch only the owner/org scoping without paying the cost
// of reconstructing the full Stage/Scene payload. Used by API routes for the
// authorization check *before* deciding whether to return the full body.
// ---------------------------------------------------------------------------

export async function readClassroomOwnership(
  id: string,
): Promise<{ ownerId: string; orgId: string } | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('stages')
    .select('owner_id, org_id')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read ownership for stage ${id}: ${error.message}`);
  }
  if (!data) return null;

  log.info(`Ownership check for classroom ${id}: org ${data.org_id}`);
  return { ownerId: data.owner_id, orgId: data.org_id };
}

/** Whether a classroom has explicitly been published through the sharing registry. */
export async function isClassroomPublic(id: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from('shared_classrooms')
    .select('id')
    .eq('stage_id', id)
    .eq('visibility', 'public')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read classroom visibility for ${id}: ${error.message}`);
  return Boolean(data);
}
