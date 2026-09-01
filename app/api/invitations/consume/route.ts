/**
 * Invitation Consumption API
 *
 * POST /api/invitations/consume — consume an invitation token, add user to org
 * Body: { token: string }
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { validateBody } from '@/lib/api/validate';
import { invitationConsumeSchema } from '@/lib/api/schemas';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const authClient = await createServerSupabaseClient();

    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Not authenticated');
    }

    const rawBody = await request.json();
    const bodyValidation = validateBody(invitationConsumeSchema, rawBody);
    if (!bodyValidation.success) return bodyValidation.response;
    const body = bodyValidation.data;

    if (!user.email) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Authenticated email is required');
    }

    // The invitee is not an organization member yet. A service-only database
    // function locks and consumes the invitation in the same transaction as
    // the membership insertion.
    const supabase = createServiceSupabaseClient();
    const { data: claimResult, error } = await supabase
      .rpc('claim_invitation_for_existing_user', {
        invitation_token: body.token,
        invited_user_id: user.id,
        invited_email: user.email.trim().toLowerCase(),
      })
      .single();
    const invitation = claimResult as { org_id: string; role: string } | null;

    if (error || !invitation) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 410, 'Invitation unavailable');
    }

    return apiSuccess({ orgId: invitation.org_id, role: invitation.role });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
