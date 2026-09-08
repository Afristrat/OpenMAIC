import { createHash, randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { resolveLaunchBindings } from './bindings';
import type { LTILaunchContext } from './types';

/** Establish SSO only for a pre-linked Qalem account; never trust an LMS email. */
export async function establishLaunchSession(
  request: NextRequest,
  response: NextResponse,
  binding: Awaited<ReturnType<typeof resolveLaunchBindings>>,
  launch: LTILaunchContext,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('LTI authentication unavailable');
  const service = createServiceSupabaseClient();
  const account = await service.auth.admin.getUserById(binding.userId);
  if (account.error || account.data.user?.id !== binding.userId || !account.data.user.email) {
    throw new Error('LTI linked account unavailable');
  }
  // The admin endpoint generates but does not send mail. The returned account
  // is checked again so an email reassignment cannot switch the SSO identity.
  const link = await service.auth.admin.generateLink({ type: 'magiclink', email: account.data.user.email });
  if (link.error || link.data.user?.id !== binding.userId || !link.data.properties?.hashed_token) {
    throw new Error('LTI authentication unavailable');
  }
  const auth = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      // Cookies are attached only to the success response, discarded on error.
      setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const verified = await auth.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session || verified.data.user?.id !== binding.userId) {
    if (verified.data.session) await auth.auth.signOut({ scope: 'local' });
    throw new Error('LTI authentication failed');
  }
  const token = randomBytes(32).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  const { error } = await service.from('lti_launch_sessions').insert({
    token_hash: createHash('sha256').update(token).digest('hex'),
    client_id: binding.clientId,
    org_id: binding.orgId,
    resource_binding_id: binding.resourceBindingId,
    user_binding_id: binding.userBindingId,
    line_item_url: launch.lineItemUrl ?? null,
    ags_scopes: launch.agsScopes,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    await auth.auth.signOut({ scope: 'local' });
    throw new Error('LTI launch persistence failed');
  }
  response.cookies.set('lti_context', token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400, path: '/',
  });
  response.headers.set('Cache-Control', 'private, no-store');
}
