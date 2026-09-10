import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { getXAPIConfig } from '@/lib/telemetry/config';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  const config = getXAPIConfig();
  // Do not disclose endpoint URLs: configuration can contain embedded credentials.
  return NextResponse.json(
    { configured: Boolean(config?.enabled), endpoint: null },
    {
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
