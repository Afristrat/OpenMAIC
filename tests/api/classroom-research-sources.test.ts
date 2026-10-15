import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { classroomPersistSchema } from '@/lib/api/schemas';

const ORG_ID = '00000000-0000-4000-8000-000000000015';

const mocks = vi.hoisted(() => ({
  persistClassroom: vi.fn(),
  readClassroomOwnership: vi.fn(),
  requireEditor: vi.fn(),
  requireAuthor: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  ClassroomSceneConflictError: class ClassroomSceneConflictError extends Error {},
  buildRequestOrigin: () => 'https://qalem.ma',
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  persistClassroom: mocks.persistClassroom,
  readClassroomOwnership: mocks.readClassroomOwnership,
  readClassroom: vi.fn(),
  isClassroomPublic: vi.fn(),
  listClassrooms: vi.fn(),
  renameClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
}));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: mocks.requireAuthor,
  requireSuperAdminOrOrgEditor: mocks.requireEditor,
  requireSuperAdminOrOrgMember: vi.fn(),
}));
vi.mock('@/lib/server/classroom-share-access', () => ({ hasClassroomShareAccess: vi.fn() }));
vi.mock('@/lib/server/classroom-edit-delegations', () => ({
  readClassroomEditDelegationState: vi.fn(),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
  }),
}));

import { POST, PUT } from '@/app/api/classroom/route';

const goodSource = { title: 'Wikipédia', url: 'https://fr.wikipedia.org/wiki/Test', excerpt: 'x' };
const badSource = { title: 'Piégé', url: 'javascript:alert(document.cookie)', excerpt: 'x' };

function stageWith(sources: unknown) {
  return { id: 'classroom_1', name: 'Cours', researchSources: sources, custom: 'conservé' };
}

function request(method: 'POST' | 'PUT', stage: unknown): NextRequest {
  return new NextRequest('https://qalem.ma/api/classroom', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orgId: ORG_ID, stage, scenes: [] }),
  });
}

describe('classroomPersistSchema, researchSources', () => {
  it('accepte des sources http(s), des sources téléversées sans URL et l’absence de sources', () => {
    const parse = (sources: unknown) =>
      classroomPersistSchema.safeParse({ orgId: ORG_ID, stage: stageWith(sources), scenes: [] });
    expect(parse([goodSource]).success).toBe(true);
    expect(parse([{ title: 'PDF', kind: 'uploaded', excerpt: 'extrait' }]).success).toBe(true);
    expect(parse(undefined).success).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'JAVASCRIPT:alert(1)', 'ftp://x.test/a'])(
    'refuse l’URL %s',
    (url) => {
      const result = classroomPersistSchema.safeParse({
        orgId: ORG_ID,
        stage: stageWith([{ ...goodSource, url }]),
        scenes: [],
      });
      expect(result.success).toBe(false);
    },
  );

  it('conserve les autres champs du stage', () => {
    const result = classroomPersistSchema.safeParse({
      orgId: ORG_ID,
      stage: stageWith([goodSource]),
      scenes: [],
    });
    expect(result.success && result.data.stage.custom).toBe('conservé');
  });
});

describe('/api/classroom, researchSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'u1', orgId: ORG_ID });
    mocks.requireEditor.mockResolvedValue({ user: { id: 'u1' } });
    mocks.requireAuthor.mockResolvedValue({ user: { id: 'u1' } });
    mocks.persistClassroom.mockImplementation(async (data) => ({
      ...data,
      url: 'https://qalem.ma/c',
    }));
  });

  it('PUT refuse une source javascript: sans rien persister', async () => {
    const response = await PUT(request('PUT', stageWith([badSource])));
    expect(response.status).toBe(400);
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('PUT accepte des sources valides', async () => {
    const response = await PUT(request('PUT', stageWith([goodSource])));
    expect(response.status).toBe(200);
    expect(mocks.persistClassroom).toHaveBeenCalledTimes(1);
  });

  it('PUT accepte un stage sans researchSources', async () => {
    const response = await PUT(request('PUT', { id: 'classroom_1', name: 'Cours' }));
    expect(response.status).toBe(200);
  });

  it('POST refuse une source javascript:', async () => {
    const response = await POST(request('POST', stageWith([badSource])));
    expect(response.status).toBe(400);
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });
});
