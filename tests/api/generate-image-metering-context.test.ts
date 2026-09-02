import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateMeteredImage: vi.fn().mockResolvedValue({ base64: 'aW1hZ2U=' }),
  requireEditor: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'a@example.com' },
  }),
  uploadClassroomMedia: vi.fn(),
}));

vi.mock('@/lib/media/image-providers', () => ({
  aspectRatioToDimensions: vi.fn(),
  IMAGE_PROVIDERS: { seedream: { requiresApiKey: false } },
}));
vi.mock('@/lib/server/metered-media-providers', () => ({
  generateMeteredImage: mocks.generateMeteredImage,
}));
vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: () => true,
  resolveImageApiKey: () => '',
  resolveImageBaseUrl: () => undefined,
}));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: mocks.requireEditor,
  requireSuperAdminOrOrgEditor: mocks.requireEditor,
}));
vi.mock('@/lib/server/classroom-storage', () => ({
  isValidClassroomId: () => true,
  readClassroomOwnership: vi.fn().mockResolvedValue({ ownerId: 'owner-1', orgId: 'org-1' }),
}));
vi.mock('@/lib/server/classroom-media-generation', () => ({
  uploadClassroomMedia: mocks.uploadClassroomMedia,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('POST /api/generate/image metering context', () => {
  it('keeps the verified tenant context through the storage upload', async () => {
    const { nextUsageOperationContext } = await import('@/lib/billing/usage-context');
    let storageContext: ReturnType<typeof nextUsageOperationContext> = null;
    mocks.uploadClassroomMedia.mockImplementationOnce(async () => {
      storageContext = nextUsageOperationContext('storage', 'storage_byte');
    });
    const { POST } = await import('@/app/api/generate/image/route');
    const request = new Request('http://localhost/api/generate/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'image-storage-test-001',
        'x-image-provider': 'seedream',
      },
      body: JSON.stringify({ classroomId: 'classroom-1', prompt: 'Une salle de classe' }),
    });

    const response = await POST(request as unknown as NextRequest);

    expect(response.status).toBe(200);
    expect(storageContext).toMatchObject({ actorUserId: 'user-1', tenantId: 'org-1' });
  });
});
