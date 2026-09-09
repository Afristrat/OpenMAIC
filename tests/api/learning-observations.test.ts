import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), collect: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/telemetry/pedagogy-collector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telemetry/pedagogy-collector')>()),
  readConsent: mocks.read,
  collectPedagogyData: mocks.collect,
}));
import { POST } from '@/app/api/learning-observations/route';
const sample = {
  consentEpoch: '00000000-0036-4000-8000-000000000099',
  sessionId: '00000000-0036-4000-8000-000000000001',
  stageId: 'stage-1',
  sceneSequence: ['slide'],
  sceneDurations: [4],
  quizScores: [],
  completionRate: 1,
  totalDuration: 4,
  subjectTags: [],
  language: 'fr-FR',
  level: 'beginner',
  agentCount: 1,
  actionCounts: { play: 1, pause: 0, seek: 0 },
};
function request(body: unknown) {
  return new NextRequest('http://localhost/api/learning-observations', {
    method: 'POST',
    headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('learning collection boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost');
    mocks.auth.mockResolvedValue({ user: { id: 'verified-user' } });
    mocks.read.mockResolvedValue(true);
    mocks.collect.mockResolvedValue(true);
  });
  it('requires authentication before reading measures', async () => {
    mocks.auth.mockResolvedValue({ response: NextResponse.json({}, { status: 401 }) });
    expect((await POST(request(sample))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([false, null])('does not collect without opt-in (%s)', async (choice) => {
    mocks.read.mockResolvedValue(choice);
    expect(await (await POST(request(sample))).json()).toEqual({ recorded: false });
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it('uses the verified actor and accepts no raw user hash', async () => {
    expect((await POST(request({ ...sample, userHash: 'forged' }))).status).toBe(400);
    expect((await POST(request(sample))).status).toBe(200);
    expect(mocks.collect).toHaveBeenCalledWith('verified-user', sample);
  });
  it('rejects mismatched scene measures', async () => {
    expect((await POST(request({ ...sample, sceneDurations: [] }))).status).toBe(400);
  });
  it('does not fabricate acknowledgement after an atomic refusal', async () => {
    mocks.collect.mockResolvedValue(false);
    expect(await (await POST(request(sample))).json()).toEqual({ recorded: false });
  });
  it('reports storage failure without private detail', async () => {
    mocks.collect.mockRejectedValue(new Error('private detail'));
    const response = await POST(request(sample));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private detail');
  });
});
