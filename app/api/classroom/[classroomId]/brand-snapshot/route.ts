import { type NextRequest } from 'next/server';
import { requireSuperAdminOrOrgEditor } from '@/lib/api/auth';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isDesignSystemV1Enabled } from '@/lib/branding/design-directive';
import {
  organizationDesignSystemFromSettings,
  serializeBrandSnapshot,
} from '@/lib/branding/organization-design-system';
import {
  isValidClassroomId,
  readClassroom,
  readClassroomOwnership,
  updateClassroomBrandSnapshot,
} from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('ClassroomBrandSnapshotAPI');

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await context.params;
    if (!isValidClassroomId(classroomId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Identifiant de formation invalide.');
    }
    const ownership = await readClassroomOwnership(classroomId);
    if (!ownership) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Formation introuvable.');
    }

    const auth = await requireSuperAdminOrOrgEditor(
      request,
      ownership.orgId,
      ownership.ownerId,
      classroomId,
    );
    if (auth.response) return auth.response;

    const supabase = createServiceSupabaseClient();
    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', ownership.orgId)
      .maybeSingle();
    if (organizationError)
      throw new Error(`Failed to read tenant settings: ${organizationError.message}`);
    if (!organization || !isDesignSystemV1Enabled(organization.settings)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Le système de design n’est pas activé pour cette organisation.',
      );
    }

    const designSystem = organizationDesignSystemFromSettings(organization.settings);
    if (!designSystem) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        409,
        'Aucune charte valide n’est configurée pour cette organisation.',
      );
    }

    const serialized = serializeBrandSnapshot(designSystem);
    const brandSnapshot = {
      version: 1 as const,
      createdAt: new Date().toISOString(),
      content: serialized.text,
    };
    await updateClassroomBrandSnapshot(classroomId, brandSnapshot);
    const persisted = await readClassroom(classroomId);
    if (persisted?.stage.brandSnapshot?.createdAt !== brandSnapshot.createdAt) {
      throw new Error('Updated brand snapshot was not confirmed by a fresh read');
    }

    for (const warning of serialized.warnings) log.warn(warning);
    return apiSuccess({
      stageId: classroomId,
      brandSnapshot,
      warnings: serialized.warnings,
    });
  } catch (error) {
    log.error('Charter synchronization failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'La synchronisation de la charte a échoué.',
    );
  }
}
