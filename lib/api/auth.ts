import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('Auth');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthUser {
  id: string;
  email: string;
}

type AuthSuccess = { user: AuthUser; response?: never };
type AuthFailure = { user?: never; response: NextResponse };
type AuthResult = AuthSuccess | AuthFailure;
type AuthorAuthSuccess = AuthSuccess & { authoredByRole: 'author' | 'super-admin' };
type AuthorAuthResult = AuthorAuthSuccess | AuthFailure;

type MembershipWithTenant = {
  role: string;
  organizations: { status: string } | { status: string }[] | null;
};

function hasActiveTenant(membership: MembershipWithTenant | null): boolean {
  if (!membership) return false;
  const tenant = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;
  return tenant?.status === 'active';
}

// ---------------------------------------------------------------------------
// requireAuth — any authenticated user
// ---------------------------------------------------------------------------

export async function requireAuth(_req: NextRequest): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        response: NextResponse.json(
          { error: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 },
          { status: 401 },
        ),
      };
    }

    return { user: { id: user.id, email: user.email ?? '' } };
  } catch (err) {
    log.error('Auth service error:', err instanceof Error ? err.message : String(err));
    return {
      response: NextResponse.json(
        { error: 'Auth service unavailable', code: 'AUTH_ERROR', status: 503 },
        { status: 503 },
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// requireSuperAdmin — checks SUPER_ADMIN_EMAILS env var
// ---------------------------------------------------------------------------

function parseSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isSuperAdminEmail(email: string): boolean {
  const superAdminEmails = parseSuperAdminEmails();
  return superAdminEmails.length > 0 && superAdminEmails.includes(email.toLowerCase());
}

export async function requireSuperAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  if (parseSuperAdminEmails().length === 0) {
    log.warn('SUPER_ADMIN_EMAILS is not configured');
    return {
      response: NextResponse.json(
        { error: 'Super admin access not configured', code: 'FORBIDDEN', status: 403 },
        { status: 403 },
      ),
    };
  }

  if (!isSuperAdminEmail(auth.user.email)) {
    return {
      response: NextResponse.json(
        { error: 'Forbidden', code: 'FORBIDDEN', status: 403 },
        { status: 403 },
      ),
    };
  }

  return auth;
}

// ---------------------------------------------------------------------------
// requireOrgMember — auth + membership in org_members
// ---------------------------------------------------------------------------

export async function requireOrgMember(req: NextRequest, orgId: string): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();

    if (!hasActiveTenant(membership as MembershipWithTenant | null)) {
      return {
        response: NextResponse.json(
          { error: 'Not a member of this organization', code: 'FORBIDDEN', status: 403 },
          { status: 403 },
        ),
      };
    }

    return auth;
  } catch (err) {
    log.error('Org membership check error:', err instanceof Error ? err.message : String(err));
    return {
      response: NextResponse.json(
        { error: 'Failed to verify organization membership', code: 'INTERNAL_ERROR', status: 500 },
        { status: 500 },
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// requireOrgAdmin — auth + role IN ('admin', 'manager')
// ---------------------------------------------------------------------------

export async function requireOrgAdmin(req: NextRequest, orgId: string): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();

    if (
      !membership ||
      !hasActiveTenant(membership as MembershipWithTenant) ||
      !['admin', 'manager'].includes(membership.role)
    ) {
      return {
        response: NextResponse.json(
          { error: 'Admin or manager access required', code: 'FORBIDDEN', status: 403 },
          { status: 403 },
        ),
      };
    }

    return auth;
  } catch (err) {
    log.error('Org admin check error:', err instanceof Error ? err.message : String(err));
    return {
      response: NextResponse.json(
        { error: 'Failed to verify organization role', code: 'INTERNAL_ERROR', status: 500 },
        { status: 500 },
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// requireSuperAdminOrOrgAdmin — auth + (super admin OR admin/manager of orgId)
// Used for classroom generation and mutation: only trusted roles may create
// content scoped to an organization.
// ---------------------------------------------------------------------------

export async function requireSuperAdminOrOrgAdmin(
  req: NextRequest,
  orgId: string,
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  if (isSuperAdminEmail(auth.user.email)) {
    return auth;
  }

  return requireOrgAdmin(req, orgId);
}

/** Authoring permission for organization-scoped learning content. */
export async function requireSuperAdminOrOrgAuthor(
  req: NextRequest,
  orgId: string,
): Promise<AuthorAuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  if (isSuperAdminEmail(auth.user.email)) {
    return { ...auth, authoredByRole: 'super-admin' };
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();

    if (
      !membership ||
      !hasActiveTenant(membership as MembershipWithTenant) ||
      !['admin', 'manager', 'author'].includes(membership.role)
    ) {
      return {
        response: NextResponse.json(
          { error: 'Author access required', code: 'FORBIDDEN', status: 403 },
          { status: 403 },
        ),
      };
    }
    return { ...auth, authoredByRole: 'author' };
  } catch (err) {
    log.error('Org author check error:', err instanceof Error ? err.message : String(err));
    return {
      response: NextResponse.json(
        { error: 'Failed to verify organization role', code: 'INTERNAL_ERROR', status: 500 },
        { status: 500 },
      ),
    };
  }
}

/**
 * Mutation permission for an existing classroom.
 * Tenant admins may edit every classroom in their organization; an author may
 * edit only classrooms they own; the configured super-admin may edit all.
 */
export async function requireSuperAdminOrOrgEditor(
  req: NextRequest,
  orgId: string,
  ownerId: string,
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;
  if (isSuperAdminEmail(auth.user.email)) {
    return auth;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role, organizations!inner(status)')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();
    const canEdit =
      membership &&
      hasActiveTenant(membership as MembershipWithTenant) &&
      (['admin', 'manager'].includes(membership.role) ||
        (membership.role === 'author' && auth.user.id === ownerId));
    if (!canEdit) {
      return {
        response: NextResponse.json(
          { error: 'Classroom editor access required', code: 'FORBIDDEN', status: 403 },
          { status: 403 },
        ),
      };
    }
    return auth;
  } catch (err) {
    log.error('Classroom editor check error:', err instanceof Error ? err.message : String(err));
    return {
      response: NextResponse.json(
        { error: 'Failed to verify classroom editor role', code: 'INTERNAL_ERROR', status: 500 },
        { status: 500 },
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// requireSuperAdminOrOrgMember — auth + (super admin OR member of orgId)
// Used for classroom reads: any member of the owning org (trainer or
// learner) may consult content, not just admins.
// ---------------------------------------------------------------------------

export async function requireSuperAdminOrOrgMember(
  req: NextRequest,
  orgId: string,
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  if (isSuperAdminEmail(auth.user.email)) {
    return auth;
  }

  return requireOrgMember(req, orgId);
}
