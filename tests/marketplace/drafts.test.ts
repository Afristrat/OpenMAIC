import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({ requireSuperAdminOrOrgAuthor: mocks.auth }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.client }));
import { POST } from '@/app/api/marketplace/agents/drafts/route';
import { marketplaceDraftSchema } from '@/lib/marketplace/draft-schema';

const payload = {
  orgId: '00000000-0000-4000-8000-000000000002',
  requestId: '00000000-0000-4000-8000-000000000003',
  agent: {
    name: 'Analyste',
    role: 'student',
    persona: 'Analyse les situations.',
    color: '#112233',
    priority: 5,
    allowedActions: ['wb_open'],
    avatar: '/avatars/teacher-2.png',
  },
};
function request(body: unknown = payload) {
  return new NextRequest('https://qalem.ma/api/marketplace/agents/drafts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(() => vi.resetAllMocks());

it('refuses tenant access before writing and rejects ownership injected by the browser', async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 403 }) });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(NextRequest), payload.orgId, {
    requireMembership: true,
  });
  expect(mocks.client).not.toHaveBeenCalled();
  expect((await POST(request({ ...payload, owner_id: 'foreign' }))).status).toBe(400);
});

it('persists a private snapshot idempotently with server-derived owner and tenant', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'saved',
        is_published: false,
        name: payload.agent.name,
        role: payload.agent.role,
        persona: payload.agent.persona,
        color: payload.agent.color,
        priority: payload.agent.priority,
        avatar: payload.agent.avatar,
        allowed_actions: payload.agent.allowedActions,
        voice_config: null,
        profile_extensions: {},
      },
      error: null,
    }),
  };
  mocks.client.mockResolvedValue({ from: () => ({ upsert: insert, ...query }) });
  expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(200);
  const row = insert.mock.calls[0][0];
  expect(insert.mock.calls[1][0].id).toBe(row.id);
  expect(row).toMatchObject({ owner_id: 'owner', org_id: payload.orgId, is_published: false });
  expect(insert.mock.calls[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  expect(query.eq).toHaveBeenCalledWith('owner_id', 'owner');
  expect(
    (await POST(request({ ...payload, agent: { ...payload.agent, name: 'Changed' } }))).status,
  ).toBe(409);
  mocks.auth.mockResolvedValue({ user: { id: 'other' } });
  await POST(request());
  expect(insert.mock.calls[3][0].id).not.toBe(row.id);
  query.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await POST(request())).status).toBe(500);
});

it('preserves advanced profiles and refuses nested secrets or unsafe source URLs', async () => {
  const extensions = {
    interactionWeight: 25,
    mechanismId: 'reflection',
    gender: 'female',
    voiceDesign: { identity: 'Analyste', texture: 'Claire', delivery: 'Posée' },
    occupationalProfile: {
      standard: 'ISCO-08',
      unitGroupCode: '2421',
      unitGroupTitle: 'Analyste',
      occupationDescription: 'Analyse les organisations.',
      tasks: ['Analyser une situation'],
      sourceTasks: ['Analyse situations'],
      taskLocale: 'fr-FR',
      sourceVersion: 'v1.2.1',
      essentialSkills: ['Analyse'],
      knowledge: ['Organisation'],
      iscoUri: 'http://data.europa.eu/esco/isco/C2421',
      occupationUri: 'https://example.org/occupation',
      sourceUrl: 'https://example.org/source',
    },
  };
  const body = { ...payload, agent: { ...payload.agent, ...extensions } };
  expect(marketplaceDraftSchema.parse(body).agent).toMatchObject(extensions);
  expect(
    marketplaceDraftSchema.safeParse({
      ...body,
      agent: {
        ...body.agent,
        voiceConfig: { providerId: 'higgs', voiceId: 'voice', apiKey: 'forbidden' },
      },
    }).success,
  ).toBe(false);
  expect(
    marketplaceDraftSchema.safeParse({
      ...body,
      agent: {
        ...body.agent,
        occupationalProfile: {
          ...extensions.occupationalProfile,
          sourceUrl: 'javascript:alert(1)',
        },
      },
    }).success,
  ).toBe(false);

  mocks.auth.mockResolvedValue({ user: { id: 'owner' } });
  let saved: Record<string, unknown> = {};
  const insert = vi.fn().mockImplementation(async (row: Record<string, unknown>) => {
    saved = row;
    return { error: null };
  });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      const { owner_id: owner, org_id: org, ...data } = saved;
      expect(owner).toBe('owner');
      expect(org).toBe(payload.orgId);
      return { data, error: null };
    }),
  };
  mocks.client.mockResolvedValue({ from: () => ({ upsert: insert, ...query }) });
  expect((await POST(request(body))).status).toBe(200);
  expect(saved.profile_extensions).toEqual(extensions);
});
