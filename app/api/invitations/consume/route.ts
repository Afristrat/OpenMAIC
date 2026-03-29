/**
 * Invitation Consumption API
 *
 * POST /api/invitations/consume — consume an invitation token, add user to org
 * Body: { token: string }
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Not authenticated');
    }

    const body = (await request.json()) as { token?: string };
    if (!body.token) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing token');
    }

    // Find the invitation
    const { data: invitation, error: findError } = await supabase
      .from('org_invitations')
      .select('id, org_id, role, expires_at, used_at')
      .eq('token', body.token)
      .single();

    if (findError || !invitation) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Invitation not found');
    }

    // Check if already used
    if (invitation.used_at) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 410, 'Invitation already used');
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 410, 'Invitation expired');
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('org_members')
      .select('id')
      .eq('org_id', invitation.org_id)
      .eq('user_id', user.id)
      .single();

    if (!existingMember) {
      // Add user to org with the invited role
      const { error: insertError } = await supabase.from('org_members').insert({
        org_id: invitation.org_id,
        user_id: user.id,
        role: invitation.role,
      });

      if (insertError) {
        return apiError(
          API_ERROR_CODES.INTERNAL_ERROR,
          500,
          'Failed to add member',
          insertError.message,
        );
      }
    }

    // Mark invitation as used
    await supabase
      .from('org_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invitation.id);

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
