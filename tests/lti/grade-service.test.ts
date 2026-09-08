import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair } from 'jose';
import { AGS_SCORE_SCOPE, submitGrade } from '@/lib/lti/grade-service';
import type { LTIGradePayload } from '@/lib/lti/types';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  fetch: vi.fn(),
  keyPair: vi.fn(),
  guard: vi.fn(),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock('@/lib/lti/index', () => ({ getKeyPair: mocks.keyPair }));
vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.guard }));
const platform = {
  id: 'platform',
  clientId: 'client',
  issuer: 'https://lms.example.org',
  deploymentId: 'deployment',
  authUrl: 'https://lms.example.org/auth',
  tokenUrl: 'https://lms.example.org/token',
  jwksUrl: 'https://lms.example.org/jwks',
};
const grade: LTIGradePayload = {
  userId: 'opaque-learner',
  scoreGiven: 80,
  scoreMaximum: 100,
  activityProgress: 'Completed',
  gradingProgress: 'FullyGraded',
};
const context = {
  qalemUserId: '00000000-0034-4000-8000-000000000001',
  resourceLinkId: 'assignment',
  timestamp: '2026-09-08T20:00:00.123Z',
  scopes: [AGS_SCORE_SCOPE],
};
const lineItem = 'https://lms.example.org/items/1?course=2';
const token = () => Response.json({ access_token: 'fixture-token', token_type: 'Bearer' });

describe('AGS delivery contract', () => {
  beforeAll(async () => {
    mocks.keyPair.mockResolvedValue({ ...(await generateKeyPair('RS256')), kid: 'fixture' });
  });
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.guard.mockReset().mockResolvedValue(null);
    vi.stubGlobal('fetch', mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retries the same score body and audits the Qalem UUID and real resource', async () => {
    mocks.fetch
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response('not logged', { status: 503 }))
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await submitGrade(platform, lineItem, grade, context)).toBe(true);
    const first = mocks.fetch.mock.calls[1];
    const second = mocks.fetch.mock.calls[3];
    expect(String(first[0])).toBe('https://lms.example.org/items/1/scores?course=2');
    expect(first[1].body).toBe(second[1].body);
    expect(JSON.parse(first[1].body)).toMatchObject({
      userId: grade.userId,
      timestamp: context.timestamp,
    });
    expect(first[1].redirect).toBe('error');
    expect(first[1].signal).toBeInstanceOf(AbortSignal);
    expect(new URLSearchParams(mocks.fetch.mock.calls[0][1].body).get('scope')).toBe(
      AGS_SCORE_SCOPE,
    );
    expect(mocks.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        user_id: context.qalemUserId,
        resource_link_id: 'assignment',
        success: true,
      }),
    );
    expect(JSON.stringify(mocks.insert.mock.calls)).not.toContain('not logged');
  });
  it('does not send again or claim success if auditing an accepted grade fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    mocks.insert.mockResolvedValue({ error: { code: 'unavailable' } });
    await expect(submitGrade(platform, lineItem, grade, context)).rejects.toThrow(
      'audit persistence failed',
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not retry permanent OAuth failures', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('private provider body', { status: 401 }));
    expect(await submitGrade(platform, lineItem, grade, context)).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: 'AGS token HTTP 401' }),
    );
  });
  it('rejects missing score permission before any network request', async () => {
    await expect(
      submitGrade(platform, lineItem, grade, { ...context, scopes: [] }),
    ).rejects.toThrow('Invalid AGS delivery');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('refuses a blocked endpoint before sending credentials', async () => {
    mocks.guard.mockResolvedValue('blocked');
    expect(await submitGrade(platform, lineItem, grade, context)).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('bounds OAuth response size and stops without submitting a score', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('x'.repeat(32769)));
    expect(await submitGrade(platform, lineItem, grade, context)).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
