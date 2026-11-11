import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export type YoutubeExportContext = {
  exportJobId: string;
  format: 'video' | 'mp4';
  sceneCount: number;
  orgId: string | null;
  courseName: string | null;
  courseDescription: string | null;
  language: string | null;
  scenes: { title: string | null }[];
};

export type YoutubeExportLookup =
  | { ok: true; context: YoutubeExportContext }
  | { ok: false; status: 400 | 404 | 409; message: string };

/**
 * Export vidéo fini appartenant à `userId`, avec ce que sa formation dit d'elle-même. La propriété
 * est lue sous la session de la personne (RLS) ; la formation et ses scènes ensuite par le serveur.
 */
export async function loadYoutubeExport(
  userId: string,
  exportJobId: string,
  chapterIndex: number | null,
): Promise<YoutubeExportLookup> {
  const supabase = await createServerSupabaseClient();
  const { data: job } = await supabase
    .from('export_jobs')
    .select('id, stage_id, format, status, scene_count, owner_id')
    .eq('id', exportJobId)
    .maybeSingle();
  if (!job || job.owner_id !== userId) {
    return { ok: false, status: 404, message: 'Export introuvable' };
  }
  if (job.status !== 'done') return { ok: false, status: 409, message: "L'export n'est pas prêt" };
  if (job.format !== 'video' && job.format !== 'mp4') {
    return { ok: false, status: 400, message: "Ce format d'export n'est pas une vidéo" };
  }
  const sceneCount = job.scene_count ?? 0;
  if (job.format === 'video' && chapterIndex !== null) {
    return { ok: false, status: 400, message: 'Cet export est une vidéo unique, sans chapitre' };
  }
  if (job.format === 'mp4' && (chapterIndex === null || chapterIndex >= sceneCount)) {
    return { ok: false, status: 400, message: 'Chapitre inconnu dans cet export' };
  }

  const service = createServiceSupabaseClient();
  const [{ data: stage }, { data: scenes }] = await Promise.all([
    service
      .from('stages')
      .select('org_id, name, description, language')
      .eq('id', job.stage_id)
      .maybeSingle(),
    service.from('scenes').select('title, order').eq('stage_id', job.stage_id).order('order'),
  ]);

  return {
    ok: true,
    context: {
      exportJobId: job.id,
      format: job.format,
      sceneCount,
      orgId: stage?.org_id ?? null,
      courseName: stage?.name ?? null,
      courseDescription: stage?.description ?? null,
      language: stage?.language ?? null,
      scenes: (scenes ?? []).map((scene) => ({ title: scene.title ?? null })),
    },
  };
}
