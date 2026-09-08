import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { LtiAccessDenied, resolveLtiContext } from '@/lib/lti/context';

/** Only capability status is public to the authenticated classroom, never LMS identity or endpoints. */
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const auth = await requireAuth(req);
  if (auth.response) {
    auth.response.headers.set('Cache-Control', headers['Cache-Control']);
    return auth.response;
  }
  const token = req.cookies.get('lti_context')?.value;
  if (!token) return NextResponse.json({ success: true, active: false }, { headers });
  try {
    const context = await resolveLtiContext({
      token,
      userId: auth.user.id,
      stageId: req.nextUrl.searchParams.get('stageId') ?? '',
    });
    return NextResponse.json(
      { success: true, active: true, gradingEnabled: context.gradingEnabled, launchId: context.sessionId },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'LTI context unavailable' },
      {
        status: error instanceof LtiAccessDenied ? 403 : 503,
        headers,
      },
    );
  }
}
