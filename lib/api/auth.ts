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

export async function requireSuperAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (superAdminEmails.length === 0) {
    log.warn('SUPER_ADMIN_EMAILS is not configured');
    return {
      response: NextResponse.json(
        { error: 'Super admin access not configured', code: 'FORBIDDEN', status: 403 },
        { status: 403 },
      ),
    };
  }

  if (!superAdminEmails.includes(auth.user.email.toLowerCase())) {
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

export async function requireOrgMember(
  req: NextRequest,
  orgId: string,
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();

    if (!membership) {
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

export async function requireOrgAdmin(
  req: NextRequest,
  orgId: string,
): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (auth.response) return auth;

  try {
    const supabase = await createServerSupabaseClient();
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', auth.user.id)
      .single();

    if (!membership || !['admin', 'manager'].includes(membership.role)) {
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
