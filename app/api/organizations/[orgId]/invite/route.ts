/**
 * Organization Invitation API
 *
 * POST /api/organizations/[orgId]/invite — create invitation (email + role), return { token, inviteUrl }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import type { OrgMemberRole } from '@/lib/supabase/types';

const VALID_ROLES: OrgMemberRole[] = ['admin', 'manager', 'formateur', 'apprenant'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  try {
    const { orgId } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Not authenticated');
    }

    // Verify caller is admin or manager
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['admin', 'manager'].includes(membership.role)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Insufficient permissions');
    }

    const body = (await request.json()) as { email?: string; role?: string };
    const role = body.role && VALID_ROLES.includes(body.role as OrgMemberRole)
      ? body.role
      : 'apprenant';
    const email = body.email?.trim() || null;

    const { data: invitation, error } = await supabase
      .from('org_invitations')
      .insert({
        org_id: orgId,
        role,
        email,
        created_by: user.id,
      })
      .select('id, token')
      .single();

    if (error || !invitation) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to create invitation',
        error?.message,
      );
    }

    const origin = request.headers.get('origin') ?? request.nextUrl.origin;
    const inviteUrl = `${origin}/auth?invite=${invitation.token}`;

    return apiSuccess({ token: invitation.token, inviteUrl });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
