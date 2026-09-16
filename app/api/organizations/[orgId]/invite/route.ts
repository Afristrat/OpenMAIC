/**
 * Organization Invitation API
 *
 * POST /api/organizations/[orgId]/invite — create invitation (email + role), return { token, inviteUrl }
 */

import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  organizationInvitationUrl,
  sendOrganizationInvitationEmail,
} from '@/lib/server/organization-invitation-email';
import type { OrgMemberRole } from '@/lib/supabase/types';
import { validateBody } from '@/lib/api/validate';
import { orgInviteSchema } from '@/lib/api/schemas';

const VALID_ROLES: OrgMemberRole[] = ['admin', 'manager', 'author', 'formateur', 'apprenant'];

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

    const { data: organization, error: organizationError } = await supabase
      .from('organizations')
      .select('name, default_locale')
      .eq('id', orgId)
      .single();
    if (organizationError || !organization) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Organization not found');
    }

    const rawBody = await request.json();
    const validation = validateBody(orgInviteSchema, rawBody);
    if (!validation.success) return validation.response;
    const body = validation.data;

    const role =
      body.role && VALID_ROLES.includes(body.role as OrgMemberRole) ? body.role : 'apprenant';
    const email = body.email.trim().toLowerCase();

    if (membership.role === 'manager' && role === 'admin') {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Managers cannot invite admins');
    }

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
      const seatLimitReached = /TENANT_SEAT_LIMIT_REACHED/i.test(error?.message ?? '');
      const tenantInactive = /TENANT_INACTIVE/i.test(error?.message ?? '');
      return apiError(
        seatLimitReached || tenantInactive
          ? API_ERROR_CODES.INVALID_REQUEST
          : API_ERROR_CODES.INTERNAL_ERROR,
        seatLimitReached ? 409 : tenantInactive ? 423 : 500,
        seatLimitReached
          ? 'Tenant seat limit reached'
          : tenantInactive
            ? 'Tenant is suspended'
            : 'Failed to create invitation',
        error?.message,
      );
    }

    let inviteUrl: string;
    try {
      inviteUrl = organizationInvitationUrl(invitation.token);
    } catch {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Invitation origin is not configured');
    }
    let emailSent = true;
    try {
      await sendOrganizationInvitationEmail({
        invitationId: invitation.id,
        recipient: email,
        organizationName: organization.name,
        locale: organization.default_locale as 'fr-FR' | 'ar-MA' | 'en-US',
        inviteUrl,
      });
    } catch {
      // Keep the one-time invitation usable and expose the established manual
      // fallback instead of silently reserving a seat behind a failed email.
      emailSent = false;
    }

    return apiSuccess({ token: invitation.token, inviteUrl, emailSent });
  } catch (err) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Internal server error',
      err instanceof Error ? err.message : undefined,
    );
  }
}
