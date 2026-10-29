import { redirect } from 'next/navigation';
import { AccountModelSync } from '@/components/account-model-sync';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PrivateApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') return children;

  let authenticated = false;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  } catch {
    // Fail closed if the authentication service or configuration is unavailable.
  }

  if (!authenticated) redirect('/auth?next=/app');
  return (
    <>
      {children}
      <AccountModelSync />
    </>
  );
}
