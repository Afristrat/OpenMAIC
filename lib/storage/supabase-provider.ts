/**
 * Supabase Sync Provider for Qalem
 *
 * Handles hybrid sync between IndexedDB (Dexie) and Supabase for
 * authenticated users. When not authenticated, all operations are no-ops
 * and the app continues in pure IndexedDB mode.
 *
 * Only stage metadata and scene content are synced — binary media
 * (audio, images, video) stay local.
 *
 * Conflict resolution: last-write-wins based on `updated_at` timestamps.
 */

import { createClient } from '@/lib/supabase/client';
import { db } from '@/lib/utils/database';
import type { StageRecord, SceneRecord } from '@/lib/utils/database';
import type { Stage, Scene, StageInsert, SceneInsert } from '@/lib/supabase/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('SupabaseSync');

// ---------------------------------------------------------------------------
// Helpers: IndexedDB ↔ Supabase row mapping
// ---------------------------------------------------------------------------

function stageRecordToRow(r: StageRecord, ownerId: string): StageInsert {
  return {
    id: r.id,
    owner_id: ownerId,
    name: r.name,
    description: r.description ?? null,
    language: r.language ?? 'fr-FR',
    style: r.style ?? null,
    agent_ids: r.agentIds ?? null,
  };
}

function stageRowToRecord(row: Stage): StageRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    language: row.language,
    style: row.style ?? undefined,
    agentIds: row.agent_ids ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function sceneRecordToRow(r: SceneRecord): SceneInsert {
  return {
    id: r.id,
    stage_id: r.stageId,
    type: r.type as SceneInsert['type'],
    title: r.title ?? null,
    order: r.order,
    content: (r.content as unknown as Record<string, unknown>) ?? null,
    actions: (r.actions as unknown as Record<string, unknown>) ?? null,
  };
}

function sceneRowToRecord(row: Scene): SceneRecord {
  return {
    id: row.id,
    stageId: row.stage_id,
    type: row.type as SceneRecord['type'],
    title: row.title ?? '',
    order: row.order,
    content: row.content as unknown as SceneRecord['content'],
    actions: (row.actions as unknown as SceneRecord['actions']) ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
  };
}

// ---------------------------------------------------------------------------
// SyncableStorageProvider
// ---------------------------------------------------------------------------

export interface SyncableStorageProvider {
  /** Check if user is authenticated */
  isAuthenticated(): boolean;

  /** Sync a single stage and its scenes to Supabase */
  syncStage(stageId: string): Promise<void>;

  /** Load stages from Supabase (for logged-in users) */
  loadRemoteStages(): Promise<StageRecord[]>;

  /** Full bidirectional sync — returns counts */
  syncAll(): Promise<{ synced: number; conflicts: number }>;
}

export class SupabaseSyncProvider implements SyncableStorageProvider {
  private userId: string | null = null;

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------

  /** Refresh the cached userId from Supabase auth */
  async refreshAuth(): Promise<void> {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      this.userId = user?.id ?? null;
    } catch {
      this.userId = null;
    }
  }

  isAuthenticated(): boolean {
    return this.userId !== null;
  }

  // ------------------------------------------------------------------
  // Single-stage sync (write-through)
  // ------------------------------------------------------------------

  async syncStage(stageId: string): Promise<void> {
    if (!this.userId) return;

    const supabase = createClient();

    // 1. Read local data
    const localStage = await db.stages.get(stageId);
    if (!localStage) return;

    const localScenes = await db.scenes.where('stageId').equals(stageId).toArray();

    // 2. Upsert stage
    const { error: stageErr } = await supabase
      .from('stages')
      .upsert(stageRecordToRow(localStage, this.userId), { onConflict: 'id' });

    if (stageErr) {
      log.error(`Failed to upsert stage ${stageId}:`, stageErr.message);
      return;
    }

    // 3. Upsert scenes
    if (localScenes.length > 0) {
      const rows = localScenes.map((s) => sceneRecordToRow(s));
      const { error: scenesErr } = await supabase
        .from('scenes')
        .upsert(rows, { onConflict: 'id' });

      if (scenesErr) {
        log.error(`Failed to upsert scenes for stage ${stageId}:`, scenesErr.message);
      }
    }

    log.info(`Synced stage ${stageId} (${localScenes.length} scenes) to Supabase`);
  }

  // ------------------------------------------------------------------
  // Load remote stages
  // ------------------------------------------------------------------

  async loadRemoteStages(): Promise<StageRecord[]> {
    if (!this.userId) return [];

    const supabase = createClient();

    const { data, error } = await supabase
      .from('stages')
      .select('*')
      .eq('owner_id', this.userId)
      .order('updated_at', { ascending: false });

    if (error) {
      log.error('Failed to load remote stages:', error.message);
      return [];
    }

    return (data ?? []).map(stageRowToRecord);
  }

  // ------------------------------------------------------------------
  // Full bidirectional sync
  // ------------------------------------------------------------------

  async syncAll(): Promise<{ synced: number; conflicts: number }> {
    if (!this.userId) return { synced: 0, conflicts: 0 };

    let synced = 0;
    let conflicts = 0;

    const supabase = createClient();

    // ---- 1. Fetch all remote stages + scenes for this user ----
    const { data: remoteStages, error: stagesErr } = await supabase
      .from('stages')
      .select('*')
      .eq('owner_id', this.userId);

    if (stagesErr) {
      log.error('syncAll: failed to fetch remote stages:', stagesErr.message);
      return { synced, conflicts };
    }

    const remoteStageMap = new Map<string, Stage>();
    for (const rs of remoteStages ?? []) {
      remoteStageMap.set(rs.id, rs);
    }

    // Fetch remote scenes for those stages
    const remoteStageIds = [...remoteStageMap.keys()];
    const remoteSceneMap = new Map<string, Scene>();

    if (remoteStageIds.length > 0) {
      const { data: remoteScenes, error: scenesErr } = await supabase
        .from('scenes')
        .select('*')
        .in('stage_id', remoteStageIds);

      if (scenesErr) {
        log.error('syncAll: failed to fetch remote scenes:', scenesErr.message);
      } else {
        for (const rs of remoteScenes ?? []) {
          remoteSceneMap.set(rs.id, rs);
        }
      }
    }

    // ---- 2. Get all local stages ----
    const localStages = await db.stages.toArray();
    const localStageMap = new Map<string, StageRecord>();
    for (const ls of localStages) {
      localStageMap.set(ls.id, ls);
    }

    // ---- 3. Merge stages: last-write-wins ----
    const allStageIds = new Set([...remoteStageMap.keys(), ...localStageMap.keys()]);

    for (const stageId of allStageIds) {
      const local = localStageMap.get(stageId);
      const remote = remoteStageMap.get(stageId);

      if (local && !remote) {
        // Local only → push to Supabase
        await this.syncStage(stageId);
        synced++;
      } else if (!local && remote) {
        // Remote only → pull to IndexedDB
        const record = stageRowToRecord(remote);
        await db.stages.put(record);

        // Pull scenes too
        const scenesForStage = [...remoteSceneMap.values()].filter(
          (s) => s.stage_id === stageId,
        );
        for (const rs of scenesForStage) {
          await db.scenes.put(sceneRowToRecord(rs));
        }
        synced++;
      } else if (local && remote) {
        // Both exist → last-write-wins
        const remoteTs = new Date(remote.updated_at).getTime();
        if (local.updatedAt > remoteTs) {
          // Local is newer → push
          await this.syncStage(stageId);
          conflicts++;
        } else if (remoteTs > local.updatedAt) {
          // Remote is newer → pull
          const record = stageRowToRecord(remote);
          await db.stages.put(record);
          conflicts++;
        }
        // Equal timestamps → no-op

        // Sync scenes for this stage regardless
        await this.syncScenes(stageId, remoteSceneMap);
        synced++;
      }
    }

    log.info(`syncAll complete: synced=${synced}, conflicts=${conflicts}`);
    return { synced, conflicts };
  }

  // ------------------------------------------------------------------
  // Internal: merge scenes for a given stage
  // ------------------------------------------------------------------

  private async syncScenes(
    stageId: string,
    remoteSceneMap: Map<string, Scene>,
  ): Promise<void> {
    if (!this.userId) return;

    const supabase = createClient();

    const localScenes = await db.scenes.where('stageId').equals(stageId).toArray();
    const localMap = new Map<string, SceneRecord>();
    for (const ls of localScenes) {
      localMap.set(ls.id, ls);
    }

    const remoteForStage = [...remoteSceneMap.values()].filter(
      (s) => s.stage_id === stageId,
    );
    const remoteMap = new Map<string, Scene>();
    for (const rs of remoteForStage) {
      remoteMap.set(rs.id, rs);
    }

    const allSceneIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

    const toUpsertRemote: SceneInsert[] = [];
    const toPutLocal: SceneRecord[] = [];

    for (const sceneId of allSceneIds) {
      const local = localMap.get(sceneId);
      const remote = remoteMap.get(sceneId);

      if (local && !remote) {
        toUpsertRemote.push(sceneRecordToRow(local));
      } else if (!local && remote) {
        toPutLocal.push(sceneRowToRecord(remote));
      } else if (local && remote) {
        const remoteTs = new Date(remote.updated_at ?? remote.created_at).getTime();
        if (local.updatedAt > remoteTs) {
          toUpsertRemote.push(sceneRecordToRow(local));
        } else if (remoteTs > local.updatedAt) {
          toPutLocal.push(sceneRowToRecord(remote));
        }
      }
    }

    // Batch upsert to Supabase
    if (toUpsertRemote.length > 0) {
      const { error } = await supabase
        .from('scenes')
        .upsert(toUpsertRemote, { onConflict: 'id' });
      if (error) {
        log.error(`syncScenes: upsert failed for stage ${stageId}:`, error.message);
      }
    }

    // Batch put to IndexedDB
    if (toPutLocal.length > 0) {
      await db.scenes.bulkPut(toPutLocal);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _syncProvider: SupabaseSyncProvider | null = null;

export function getSyncProvider(): SupabaseSyncProvider {
  if (!_syncProvider) {
    _syncProvider = new SupabaseSyncProvider();
  }
  return _syncProvider;
}
