import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '00000000-0000-4000-8000-000000000015';

const mocks = vi.hoisted(() => ({
  persistClassroom: vi.fn(),
  readClassroom: vi.fn(),
  readClassroomOwnership: vi.fn(),
  isClassroomPublic: vi.fn(),
  listClassrooms: vi.fn(),
  requireAdmin: vi.fn(),
  requireAuthor: vi.fn(),
  requireMember: vi.fn(),
  download: vi.fn(),
  createGenerationJob: vi.fn(),
  enqueueGeneration: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  buildRequestOrigin: () => 'https://qalem.ma',
  classroomMediaContentType: () => 'audio/wav',
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  persistClassroom: mocks.persistClassroom,
  readClassroom: mocks.readClassroom,
  readClassroomOwnership: mocks.readClassroomOwnership,
  isClassroomPublic: mocks.isClassroomPublic,
  listClassrooms: mocks.listClassrooms,
  renameClassroom: vi.fn(),
  deleteClassroom: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAdmin: mocks.requireAdmin,
  requireSuperAdminOrOrgAuthor: mocks.requireAuthor,
  requireSuperAdminOrOrgMember: mocks.requireMember,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

vi.mock('@/lib/server/classroom-job-store', () => ({
  createClassroomGenerationJob: mocks.createGenerationJob,
  markClassroomGenerationJobFailed: vi.fn(),
}));

vi.mock('@/lib/jobs/queue', () => ({ enqueueClassroomGeneration: mocks.enqueueGeneration }));

import { GET as getClassroom, POST as postClassroom } from '@/app/api/classroom/route';
import { GET as getClassroomMedia } from '@/app/api/classroom-media/[classroomId]/[...path]/route';
import { POST as generateClassroom } from '@/app/api/generate-classroom/route';

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

describe('classroom tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      user: { id: 'session-owner', email: 'admin@qalem.ma' },
    });
    mocks.requireAuthor.mockResolvedValue({
      user: { id: 'session-owner', email: 'author@qalem.ma' },
      authoredByRole: 'author',
    });
    mocks.requireMember.mockResolvedValue({
      user: { id: 'org-member', email: 'member@qalem.ma' },
    });
    mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'session-owner', orgId: ORG_ID });
    mocks.isClassroomPublic.mockResolvedValue(false);
    mocks.listClassrooms.mockResolvedValue([]);
  });

  it('derives ownerId from the authenticated session and ignores an injected ownerId', async () => {
    mocks.persistClassroom.mockImplementation(async (data) => ({
      ...data,
      createdAt: '2026-07-22T00:00:00.000Z',
      url: `https://qalem.ma/classroom/${data.id}`,
    }));

    const response = await postClassroom(
      new NextRequest('https://qalem.ma/api/classroom', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgId: ORG_ID,
          ownerId: 'attacker-controlled-owner',
          stage: { id: 'classroom_15', name: 'Persistent classroom' },
          scenes: [
            {
              id: 'scene_15',
              stageId: 'classroom_15',
              type: 'slide',
              title: 'Introduction',
              order: 1,
              content: {},
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(NextRequest), ORG_ID);
    expect(mocks.persistClassroom).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'classroom_15',
        ownerId: 'session-owner',
        orgId: ORG_ID,
      }),
      'https://qalem.ma',
    );
  });

  it('rejects malformed generation input as a client error before authorization', async () => {
    const response = await postClassroom(
      new NextRequest('https://qalem.ma/api/classroom', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.persistClassroom).not.toHaveBeenCalled();
  });

  it('rejects malformed asynchronous generation input before creating a durable job', async () => {
    const response = await generateClassroom(
      new NextRequest('https://qalem.ma/api/generate-classroom', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.requireAuthor).not.toHaveBeenCalled();
    expect(mocks.createGenerationJob).not.toHaveBeenCalled();
    expect(mocks.enqueueGeneration).not.toHaveBeenCalled();
  });

  it('returns the authorization failure before reading a private cross-org classroom', async () => {
    mocks.requireMember.mockResolvedValue({ response: forbidden() });

    const response = await getClassroom(
      new NextRequest('https://qalem.ma/api/classroom?id=private_classroom'),
    );

    expect(response.status).toBe(403);
    expect(mocks.requireMember).toHaveBeenCalledWith(expect.any(NextRequest), ORG_ID);
    expect(mocks.readClassroom).not.toHaveBeenCalled();
  });

  it('allows anonymous reads only after explicit publication and hides ownership state', async () => {
    mocks.isClassroomPublic.mockResolvedValue(true);
    mocks.readClassroom.mockResolvedValue({
      id: 'published_classroom',
      stage: { id: 'published_classroom', name: 'Published classroom' },
      scenes: [],
      createdAt: '2026-07-22T00:00:00.000Z',
      ownerId: 'session-owner',
      orgId: ORG_ID,
    });

    const response = await getClassroom(
      new NextRequest('https://qalem.ma/api/classroom?id=published_classroom'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(body.classroom).not.toHaveProperty('ownerId');
    expect(body.classroom).not.toHaveProperty('orgId');
  });

  it('protects organization catalogue reads with the member gate', async () => {
    const response = await getClassroom(
      new NextRequest(`https://qalem.ma/api/classroom?orgId=${ORG_ID}`),
    );

    expect(response.status).toBe(200);
    expect(mocks.requireMember).toHaveBeenCalledWith(expect.any(NextRequest), ORG_ID);
    expect(mocks.listClassrooms).toHaveBeenCalledWith(ORG_ID);
  });
});

describe('classroom media tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readClassroomOwnership.mockResolvedValue({ ownerId: 'session-owner', orgId: ORG_ID });
    mocks.isClassroomPublic.mockResolvedValue(false);
    mocks.requireMember.mockResolvedValue({ response: forbidden() });
  });

  it('refuses private media before touching Storage', async () => {
    const response = await getClassroomMedia(
      new NextRequest('https://qalem.ma/api/classroom-media/private_classroom/audio/voice.wav'),
      {
        params: Promise.resolve({
          classroomId: 'private_classroom',
          path: ['audio', 'voice.wav'],
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('streams published media without authentication from the scoped Storage path', async () => {
    mocks.isClassroomPublic.mockResolvedValue(true);
    mocks.download.mockResolvedValue({ data: new Blob(['voice']), error: null });

    const response = await getClassroomMedia(
      new NextRequest('https://qalem.ma/api/classroom-media/published_classroom/audio/voice.wav'),
      {
        params: Promise.resolve({
          classroomId: 'published_classroom',
          path: ['audio', 'voice.wav'],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledWith('published_classroom/audio/voice.wav');
  });
});
