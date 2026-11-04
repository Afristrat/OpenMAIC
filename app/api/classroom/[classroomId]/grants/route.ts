import { NextRequest, type NextResponse } from 'next/server';
import { requireSuperAdminOrOrgSharer } from '@/lib/api/auth';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroomOwnership } from '@/lib/server/classroom-storage';
import {
  organizationInvitationUrl,
  sendStageShareInvitationEmail,
} from '@/lib/server/organization-invitation-email';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  grantStageByEmail,
  listStageGrants,
  listStageInvitations,
  normalizeShareEmail,
  revokeStageGrant,
  revokeStageInvitation,
} from '@/lib/server/stage-grants';

const log = createLogger('ClassroomGrants');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SharerContext =
  | { response: NextResponse; userId?: never }
  | { response?: never; userId: string };

async function resolveSharer(request: NextRequest, classroomId: string): Promise<SharerContext> {
  if (!isValidClassroomId(classroomId)) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Classroom invalide') };
  }
  const ownership = await readClassroomOwnership(classroomId);
  if (!ownership) {
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom introuvable') };
  }
  const auth = await requireSuperAdminOrOrgSharer(request, ownership.orgId, ownership.ownerId);
  if (auth.response) return { response: auth.response };
  return { userId: auth.user.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    const [grants, invitations] = await Promise.all([
      listStageGrants(classroomId),
      listStageInvitations(classroomId),
    ]);
    return apiSuccess({ grants, invitations });
  } catch (error) {
    log.error('Failed to list classroom grants', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec de lecture des partages');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizeShareEmail(body?.email);
    if (!email) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Adresse e-mail invalide');
    }
    const result = await grantStageByEmail({
      stageId: classroomId,
      email,
      grantedBy: context.userId,
    });
    if (result.status === 'invited') {
      // Adresse sans compte : invitation PAR FORMATION, jamais d'adhésion à l'organisation.
      let inviteUrl: string;
      try {
        inviteUrl = organizationInvitationUrl(result.token);
      } catch {
        return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, "Origine d'invitation non configurée");
      }
      let emailSent = true;
      try {
        const { data: stage } = await createServiceSupabaseClient()
          .from('stages')
          .select('name, language')
          .eq('id', classroomId)
          .maybeSingle();
        await sendStageShareInvitationEmail({
          invitationId: result.invitationId,
          recipient: email,
          courseName: String(stage?.name ?? ''),
          locale: String(stage?.language ?? 'fr-FR'),
          inviteUrl,
        });
      } catch (error) {
        // Le lien à usage unique reste valable : on le rend à l'auteur du partage plutôt que de le perdre.
        log.warn('Stage share invitation email not sent', error);
        emailSent = false;
      }
      return apiSuccess({ status: 'invited', emailSent, ...(emailSent ? {} : { inviteUrl }) });
    }
    return apiSuccess({ status: result.status });
  } catch (error) {
    log.error('Failed to grant classroom', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec du partage');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  try {
    const { classroomId } = await params;
    const context = await resolveSharer(request, classroomId);
    if (context.response) return context.response;
    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      invitationId?: unknown;
    } | null;
    if (typeof body?.invitationId === 'string') {
      if (!UUID_PATTERN.test(body.invitationId)) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invitation invalide');
      }
      await revokeStageInvitation(classroomId, body.invitationId);
      return apiSuccess({ revoked: true });
    }
    if (typeof body?.userId !== 'string' || !UUID_PATTERN.test(body.userId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Personne invalide');
    }
    await revokeStageGrant(classroomId, body.userId);
    return apiSuccess({ revoked: true });
  } catch (error) {
    log.error('Failed to revoke classroom grant', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Échec du retrait du partage');
  }
}
