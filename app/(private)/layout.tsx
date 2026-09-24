import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PrivateApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') return children;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return children;
  } catch {
    // Fail closed if the authentication service or configuration is unavailable.
  }

  redirect('/auth?next=/app');
}
