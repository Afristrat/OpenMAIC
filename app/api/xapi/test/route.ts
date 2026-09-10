import { NextResponse, type NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/api/auth';
import { getXAPIConfig } from '@/lib/telemetry/config';

const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.response) return auth.response;
  if (
    request.headers.get('origin') !== new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  )
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403, headers });
  const config = getXAPIConfig();
  if (!config?.enabled)
    return NextResponse.json({ error: 'LRS not configured or disabled' }, { status: 409, headers });
  try {
    // Trusted server configuration only; never accept a destination from the browser.
    const endpoint = new URL(config.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error('Invalid LRS configuration');
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/about`;
    const response = await fetch(endpoint, {
      headers: { Authorization: config.auth, 'X-Experience-API-Version': '1.0.3' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) throw new Error('LRS unavailable');
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('version' in body) ||
      !Array.isArray(body.version) ||
      !body.version.includes('1.0.3')
    )
      throw new Error('Incompatible LRS');
    // /about can be public: this proves connectivity/version, not write permission.
    return NextResponse.json(
      { success: true, connectionVerified: true, writeVerified: false },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: 'LRS connection could not be verified' },
      { status: 503, headers },
    );
  }
}
