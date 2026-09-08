import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { LtiAccessDenied } from '@/lib/lti/context';
import { ltiSubmissionSchema, LtiSubmissionConflict, submitLtiQuiz } from '@/lib/lti/quiz-submission';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reply = (data: object, status: number) => NextResponse.json(data, { status, headers });
  const auth = await requireAuth(req);
  if (auth.response) {
    auth.response.headers.set('Cache-Control', headers['Cache-Control']);
    return auth.response;
  }
  const origin = process.env.LTI_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !URL.canParse(origin) || req.headers.get('origin') !== new URL(origin).origin) {
    return reply({ success: false, error: 'Invalid submission origin' }, 403);
  }
  const token = req.cookies.get('lti_context')?.value;
  if (!token) return reply({ success: false, error: 'LTI launch required' }, 403);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return reply({ success: false, error: 'JSON submission required' }, 415);
  }
  let raw: unknown;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ success: false, error: 'Submission required' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2097152) {
          await reader.cancel();
          return reply({ success: false, error: 'Submission too large' }, 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return reply({ success: false, error: 'Invalid JSON submission' }, 400); }
  const parsed = ltiSubmissionSchema.safeParse(raw);
  if (!parsed.success) return reply({ success: false, error: 'Invalid quiz submission' }, 400);
  try {
    const result = await submitLtiQuiz(auth.user.id, token, parsed.data);
    if (result.status === 'busy') {
      const response = reply({ success: true, status: 'grading' }, 202);
      response.headers.set('Retry-After', '3');
      return response;
    }
    return reply({ success: true, status: 'queued', ...result.result, deliveryId: result.outboxId }, 200);
  } catch (error) {
    const status = error instanceof LtiAccessDenied ? 403 : error instanceof LtiSubmissionConflict ? 409 : 503;
    return reply({ success: false, error: 'LTI quiz submission unavailable' }, status);
  }
}
