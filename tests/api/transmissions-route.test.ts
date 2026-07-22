import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireSuperAdminOrOrgAdmin: vi.fn(),
  enqueueTransmission: vi.fn(),
  readClassroomOwnership: vi.fn(),
  recipientMembership: vi.fn(),
  existingTransmission: vi.fn(),
  insertedTransmission: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAdmin: mocks.requireSuperAdminOrOrgAdmin,
}));
vi.mock('@/lib/jobs/queue', () => ({ enqueueTransmission: mocks.enqueueTransmission }));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: (id: string) => /^[a-zA-Z0-9_-]+$/.test(id),
  readClassroomOwnership: mocks.readClassroomOwnership,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'org_members') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => mocks.recipientMembership() }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: () => mocks.existingTransmission() }) }),
          }),
        }),
        insert: () => ({ select: () => ({ single: () => mocks.insertedTransmission() }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
  }),
}));

const sender = '11111111-1111-4111-8111-111111111111';
const recipient = '22222222-2222-4222-8222-222222222222';

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/transmissions/route');
  const request = new Request('https://qalem.ma/api/transmissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(request as unknown as NextRequest);
}

describe('POST /api/transmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readClassroomOwnership.mockResolvedValue({ ownerId: sender, orgId: 'org_1' });
    mocks.requireSuperAdminOrOrgAdmin.mockResolvedValue({
      user: { id: sender, email: 'sender@qalem.ma' },
    });
    mocks.recipientMembership.mockResolvedValue({ data: { user_id: recipient }, error: null });
    mocks.existingTransmission.mockResolvedValue({ data: null, error: null });
    mocks.insertedTransmission.mockResolvedValue({
      data: { id: 'tx_1', status: 'queued' },
      error: null,
    });
    mocks.enqueueTransmission.mockResolvedValue('transmission-tx_1');
  });

  it('rejects malformed input before touching classroom ownership', async () => {
    const response = await post({ stageId: 'stage_1', recipientUserId: 'not-a-uuid' });
    expect(response.status).toBe(400);
    expect(mocks.readClassroomOwnership).not.toHaveBeenCalled();
  });

  it('rejects a recipient outside the classroom organization', async () => {
    mocks.recipientMembership.mockResolvedValue({ data: null, error: null });
    const response = await post({ stageId: 'stage_1', recipientUserId: recipient });
    expect(response.status).toBe(404);
    expect(mocks.insertedTransmission).not.toHaveBeenCalled();
  });

  it('returns an existing transmission without submitting duplicate work', async () => {
    mocks.existingTransmission.mockResolvedValue({
      data: { id: 'tx_existing', status: 'done' },
      error: null,
    });
    const response = await post({ stageId: 'stage_1', recipientUserId: recipient });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ id: 'tx_existing', status: 'done', existing: true });
    expect(mocks.enqueueTransmission).not.toHaveBeenCalled();
  });

  it('requeues a failed transmission without creating a duplicate delivery', async () => {
    mocks.existingTransmission.mockResolvedValue({
      data: { id: 'tx_failed', status: 'failed' },
      error: null,
    });

    const response = await post({ stageId: 'stage_1', recipientUserId: recipient });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ id: 'tx_failed', status: 'queued', existing: true, retried: true });
    expect(mocks.enqueueTransmission).toHaveBeenCalledWith({ transmissionId: 'tx_failed' });
    expect(mocks.insertedTransmission).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped asynchronous transmission', async () => {
    const response = await post({ stageId: 'stage_1', recipientUserId: recipient });
    const payload = await response.json();
    expect(response.status).toBe(202);
    expect(payload).toMatchObject({ id: 'tx_1', status: 'queued', existing: false });
    expect(payload.url).toBe('https://qalem.ma/transmissions/tx_1');
    expect(mocks.enqueueTransmission).toHaveBeenCalledWith({ transmissionId: 'tx_1' });
  });
});
