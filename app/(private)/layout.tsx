import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TelemetryConsentBanner } from '@/components/telemetry-consent-banner';

export const dynamic = 'force-dynamic';

export default async function PrivateApplicationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactNode> {
  const content = (userId?: string) => (
    <>
      {children}
      <TelemetryConsentBanner userId={userId} />
    </>
  );
  if (process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true') return content();

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return content(user.id);
  } catch {
    // Fail closed if the authentication service or configuration is unavailable.
  }

  redirect('/auth?next=/app');
}
