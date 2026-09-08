import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/lti/quiz/route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), submit: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/lti/quiz-submission', async (original) => ({ ...await original<typeof import('@/lib/lti/quiz-submission')>(), submitLtiQuiz: mocks.submit }));
const id = '00000000-0034-4000-8000-000000000001';
const body = { stageId: 'stage', sceneId: 'quiz', requestId: id, answers: { q: 'A' } };
function request(data: unknown = body, headers: Record<string, string> = {}) {
  return new NextRequest('https://qalem.ma/api/lti/quiz', { method: 'POST',
    headers: { origin: 'https://qalem.ma', 'content-type': 'application/json', cookie: `lti_context=${'a'.repeat(64)}`, ...headers },
    body: JSON.stringify(data),
  });
}
describe('authenticated LTI quiz route', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('LTI_APP_URL', 'https://qalem.ma'); mocks.auth.mockResolvedValue({ user: { id } }); });
  afterEach(() => vi.unstubAllEnvs());
  it('refuses unauthenticated requests before reading submissions', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it.each([{ origin: 'https://foreign.example' }, { cookie: '' }])('refuses foreign origins and missing launch cookies', async (headers) => {
    expect((await POST(request(body, headers))).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('refuses client scores and answer keys instead of ignoring them', async () => {
    expect((await POST(request({ ...body, score: 100, questions: [] }))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('bounds the actual request body even without content-length', async () => {
    expect((await POST(request({ ...body, answers: { q: 'a'.repeat(2097152) } }))).status).toBe(413);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('returns a retryable in-progress response without a score', async () => {
    mocks.submit.mockResolvedValue({ status: 'busy' });
    const response = await POST(request());
    expect(response.status).toBe(202); expect(response.headers.get('retry-after')).toBe('3');
    expect(await response.json()).toEqual({ success: true, status: 'grading' });
  });
  it('returns only the committed grade and queued delivery identifier', async () => {
    mocks.submit.mockResolvedValue({ status: 'completed', result: { score: 80, results: [] }, outboxId: id });
    const response = await POST(request());
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ success: true, status: 'queued', score: 80, results: [], deliveryId: id });
    expect(mocks.submit).toHaveBeenCalledWith(id, 'a'.repeat(64), { ...body, language: 'en-US' });
  });
  it('returns a service failure, never a synthetic grade, after correction failure', async () => {
    mocks.submit.mockRejectedValue(new Error('private provider details'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, error: 'LTI quiz submission unavailable' });
  });
});
