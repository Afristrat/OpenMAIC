import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('ClassroomStorage');

// Ephemeral generation-job status tracking (queued/running/succeeded/failed
// polling state) — separate concern from the final classroom persisted below,
// short-lived and safe to lose on redeploy (the client re-polls or re-triggers).
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
  ownerId: string;
  orgId: string;
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

interface StageExtra {
  createdAt?: number;
  updatedAt?: number;
  languageDirective?: string;
  whiteboard?: Stage['whiteboard'];
  videoManifest?: Stage['videoManifest'];
  generatedAgentConfigs?: Stage['generatedAgentConfigs'];
  interactiveMode?: boolean;
  taskEngineMode?: boolean;
}

interface SceneExtra {
  createdAt?: number;
  updatedAt?: number;
  whiteboards?: Scene['whiteboards'];
  multiAgent?: Scene['multiAgent'];
}

function buildStageExtra(stage: Stage): StageExtra {
  return {
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    languageDirective: stage.languageDirective,
    whiteboard: stage.whiteboard,
    videoManifest: stage.videoManifest,
    generatedAgentConfigs: stage.generatedAgentConfigs,
    interactiveMode: stage.interactiveMode,
    taskEngineMode: stage.taskEngineMode,
  };
}

function buildSceneExtra(scene: Scene): SceneExtra {
  return {
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    whiteboards: scene.whiteboards,
    multiAgent: scene.multiAgent,
  };
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
    ownerId: string;
    orgId: string;
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const supabase = createServiceSupabaseClient();

  const { error: stageError } = await supabase.from('stages').upsert({
    id: data.id,
    owner_id: data.ownerId,
    org_id: data.orgId,
    name: data.stage.name,
    description: data.stage.description ?? null,
    style: data.stage.style ?? null,
    agent_ids: data.stage.agentIds ?? null,
    extra: buildStageExtra(data.stage),
  });
  if (stageError) {
    throw new Error(`Failed to persist stage ${data.id}: ${stageError.message}`);
  }

  if (data.scenes.length > 0) {
    const { error: scenesError } = await supabase.from('scenes').upsert(
      data.scenes.map((scene) => ({
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
    style: stageRow.style ?? undefined,
    whiteboard: stageExtra.whiteboard,
    videoManifest: stageExtra.videoManifest,
    agentIds: stageRow.agent_ids ?? undefined,
    generatedAgentConfigs: stageExtra.generatedAgentConfigs,
    interactiveMode: stageExtra.interactiveMode,
    taskEngineMode: stageExtra.taskEngineMode,
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
