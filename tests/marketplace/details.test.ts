import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.client }));
import { GET } from '@/app/api/marketplace/agents/[agentId]/route';
import { importMarketplaceAgent } from '@/lib/marketplace/import-agent';

it('round-trips a stored publication through the details route and shared importer', async () => {
  const row = {
    id: 'published',
    name: 'Analyste',
    role: 'student',
    persona: 'Analyse les situations.',
    avatar: '/avatars/teacher-2.png',
    color: '#112233',
    priority: 9,
    allowed_actions: ['wb_open'],
    voice_config: { providerId: 'higgs-tts', voiceId: 'voice' },
    profile_extensions: {
      gender: 'female',
      interactionWeight: 37,
      mechanismId: 'reflection',
      voiceDesign: { identity: 'Analyste', texture: 'Claire', delivery: 'Posée' },
    },
    is_published: true,
    owner_id: null,
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(async () => ({ data: row, error: null })),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  mocks.client.mockResolvedValue({ from: () => query });
  const request = new NextRequest('https://qalem.ma/api/marketplace/agents/published');
  const params = { params: Promise.resolve({ agentId: 'published' }) };
  const response = await GET(request, params);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(importMarketplaceAgent(body.agent.configuration, 'copy')).toMatchObject({
    ...row.profile_extensions,
    name: row.name,
    persona: row.persona,
    priority: 9,
    allowedActions: row.allowed_actions,
    voiceConfig: row.voice_config,
  });
  expect(body.agent.configuration).not.toHaveProperty('owner_id');
  row.is_published = false;
  expect((await GET(request, params)).status).toBe(404);
  row.is_published = true;
  row.priority = 100;
  expect((await GET(request, params)).status).toBe(500);
});
