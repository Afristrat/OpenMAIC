/**
 * GET /api/account/is-admin
 *
 * Returns { isAdmin: boolean } based on the server-side SUPER_ADMIN_EMAILS env var.
 * This keeps the super admin email list out of the client bundle.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ isAdmin: false });
  }

  // If no super admin emails configured, first user is admin (dev mode)
  if (SUPER_ADMIN_EMAILS.length === 0) {
    return NextResponse.json({ isAdmin: true });
  }

  const userEmail = user.email?.toLowerCase() || '';
  return NextResponse.json({ isAdmin: SUPER_ADMIN_EMAILS.includes(userEmail) });
}
