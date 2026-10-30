/**
 * GET /api/courses/catalog/video/[exportId]?orgId=… — lecture de la vidéo MP4 d'une formation du catalogue.
 *
 * Réservé aux membres de l'organisation, et seulement pour une formation prête et visible au catalogue.
 * La route répond par une redirection vers une URL signée de courte durée (bucket privé) : chaque requête
 * du lecteur (y compris les sauts dans la vidéo) obtient ainsi une signature fraîche.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { exportJobArtifactPath } from '@/lib/export/export-job-artifact';
import { isFeatureEnabled } from '@/lib/flags';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { privateArtifactUrl } from '@/lib/server/private-artifact-url';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
const log = createLogger('CatalogVideoAPI');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
) {
  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'orgId is required');
  }
  const auth = await requireSuperAdminOrOrgMember(request, orgId);
  if (auth.response) return auth.response;
  if (!(await isFeatureEnabled('course_catalog'))) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course catalog is unavailable');
  }

  const { exportId } = await context.params;
  const service = createServiceSupabaseClient();
  const { data: job } = await service
    .from('export_jobs')
    .select('id, stage_id, format, status, storage_path')
    .eq('id', exportId)
    .maybeSingle();
  if (!job || job.format !== 'mp4' || job.status !== 'done' || !job.storage_path) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Vidéo introuvable');
  }

  // La vidéo n'est lisible que si sa formation est publiée au catalogue de CETTE organisation.
  const { data: course } = await service
    .from('courses')
    .select('id')
    .eq('org_id', orgId)
    .eq('stage_id', job.stage_id)
    .eq('status', 'ready')
    .eq('catalog_visible', true)
    .limit(1)
    .maybeSingle();
  if (!course) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Vidéo introuvable');

  try {
    if (job.storage_path !== exportJobArtifactPath(job.stage_id, job.id, job.format)) {
      throw new Error('Chemin d’artefact inattendu');
    }
    const location = await privateArtifactUrl('exports', job.storage_path, false);
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: location,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    log.error('Impossible de signer la vidéo du catalogue:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 503, 'Vidéo indisponible');
  }
}
