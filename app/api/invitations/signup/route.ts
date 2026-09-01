import { NextRequest } from 'next/server';
import { validateBody } from '@/lib/api/validate';
import { invitationSignupSchema } from '@/lib/api/schemas';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const validation = validateBody(invitationSignupSchema, await request.json());
    if (!validation.success) return validation.response;

    const { token, password } = validation.data;
    const email = validation.data.email.toLowerCase();
    const supabase = createServiceSupabaseClient();
    const { data: invitation, error: invitationError } = await supabase
      .from('org_invitations')
      .select('email, expires_at, used_at')
      .eq('token', token)
      .single();

    if (invitationError || !invitation) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Invitation not found');
    }
    if (invitation.used_at || new Date(invitation.expires_at) <= new Date()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 410, 'Invitation unavailable');
    }
    if (invitation.email.trim().toLowerCase() !== email) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Invitation email does not match');
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // GoTrue persists user metadata in the initial auth.users INSERT, so the
      // database trigger can claim the invitation in that same transaction.
      user_metadata: { qalem_invitation_token: token },
    });

    if (error || !data.user) {
      const alreadyRegistered = /already|registered|exists/i.test(error?.message ?? '');
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        alreadyRegistered ? 409 : 422,
        alreadyRegistered ? 'Account already exists' : 'Invitation signup failed',
      );
    }

    return apiSuccess({ created: true }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Internal server error',
      error instanceof Error ? error.message : undefined,
    );
  }
}
