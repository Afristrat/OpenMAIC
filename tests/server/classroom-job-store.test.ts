import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  rows: new Map<string, { status: string; payload: Record<string, unknown>; updated_at: string }>(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== 'classroom_generation_jobs') throw new Error(`Unexpected table: ${table}`);
      return {
        insert: async (row: { id: string; status: string; payload: Record<string, unknown> }) => {
          database.rows.set(row.id, {
            status: row.status,
            payload: structuredClone(row.payload),
            updated_at: new Date().toISOString(),
          });
          return { error: null };
        },
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({
              data: database.rows.has(id)
                ? {
                    payload: structuredClone(database.rows.get(id)!.payload),
                    updated_at: database.rows.get(id)!.updated_at,
                  }
                : null,
              error: null,
            }),
          }),
        }),
        update: (patch: {
          status?: string;
          payload?: Record<string, unknown>;
          updated_at?: string;
        }) => ({
          eq: async (_column: string, id: string) => {
            const existing = database.rows.get(id);
            if (existing) {
              database.rows.set(id, {
                status: patch.status ?? existing.status,
                payload: patch.payload ? structuredClone(patch.payload) : existing.payload,
                updated_at: patch.updated_at ?? existing.updated_at,
              });
            }
            return { error: null };
          },
        }),
      };
    },
  }),
}));

import {
  createClassroomGenerationJob,
  markClassroomGenerationJobRunning,
  readClassroomGenerationJob,
  touchClassroomGenerationJob,
  updateClassroomGenerationJobProgress,
} from '@/lib/server/classroom-job-store';

describe('persistent classroom generation jobs', () => {
  beforeEach(() => {
    database.rows.clear();
    vi.useRealTimers();
  });

  it('persists creation and progress updates in Supabase', async () => {
    await createClassroomGenerationJob(
      'job-1',
      { orgId: 'org-1', requirement: 'Build a practical LiteLLM course' },
      'owner-1',
    );
    await markClassroomGenerationJobRunning('job-1');
    await updateClassroomGenerationJobProgress('job-1', {
      step: 'generating_scenes',
      progress: 52,
      message: 'Generating scene 4/8',
      scenesGenerated: 3,
      totalScenes: 8,
    });

    const job = await readClassroomGenerationJob('job-1');

    expect(job).toMatchObject({
      id: 'job-1',
      ownerId: 'owner-1',
      orgId: 'org-1',
      status: 'running',
      step: 'generating_scenes',
      progress: 52,
      scenesGenerated: 3,
      totalScenes: 8,
    });
    expect(database.rows.get('job-1')?.status).toBe('running');
  });

  it('persists durable input without persisting a client API key', async () => {
    await createClassroomGenerationJob(
      'job-durable',
      {
        orgId: 'org-1',
        requirement: 'Build a sourced course',
        enableWebSearch: true,
        webSearchApiKey: 'client-secret-that-must-not-be-persisted',
      },
      'owner-1',
    );

    const job = await readClassroomGenerationJob('job-durable');

    expect(job?.input).toMatchObject({
      orgId: 'org-1',
      requirement: 'Build a sourced course',
      enableWebSearch: true,
    });
    expect(job?.input).not.toHaveProperty('webSearchApiKey');
  });

  it('marks an abandoned running job as failed after thirty minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
    await createClassroomGenerationJob(
      'job-stale',
      { orgId: 'org-1', requirement: 'Persistent generation' },
      'owner-1',
    );
    await markClassroomGenerationJobRunning('job-stale');

    vi.setSystemTime(new Date('2026-07-19T10:31:00.000Z'));
    const job = await readClassroomGenerationJob('job-stale');

    expect(job).toMatchObject({ status: 'failed', step: 'failed' });
    expect(database.rows.get('job-stale')?.status).toBe('failed');
  });

  it('keeps a long-running job alive when its heartbeat is fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
    await createClassroomGenerationJob(
      'job-heartbeat',
      { orgId: 'org-1', requirement: 'Long TTS generation' },
      'owner-1',
    );
    await markClassroomGenerationJobRunning('job-heartbeat');

    vi.setSystemTime(new Date('2026-07-19T10:29:00.000Z'));
    await touchClassroomGenerationJob('job-heartbeat');
    vi.setSystemTime(new Date('2026-07-19T10:45:00.000Z'));

    await expect(readClassroomGenerationJob('job-heartbeat')).resolves.toMatchObject({
      status: 'running',
    });
  });
});
