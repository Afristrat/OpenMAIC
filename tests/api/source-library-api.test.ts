import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  authorAuth: vi.fn(),
  memberAuth: vi.fn(),
  ingest: vi.fn(),
  list: vi.fn(),
  latest: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: mocks.authorAuth,
  requireSuperAdminOrOrgMember: mocks.memberAuth,
}));
vi.mock('@/lib/server/formation-source-library', () => ({
  ingestOrganizationSource: mocks.ingest,
  listOrganizationSources: mocks.list,
  readLatestSourceManifest: mocks.latest,
  replaceSourceManifest: mocks.replace,
}));

import { GET as getSources, POST as postSource } from '@/app/api/source-library/route';
import { GET as getManifest, PUT as putManifest } from '@/app/api/source-manifests/route';

const orgId = '432f141e-f1d3-4ed9-bad3-6768100802a4';
const sourceIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

describe('source library and manifest APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const auth = {
      user: { id: 'author-1', email: 'author@example.test' },
      authoredByRole: 'author',
    };
    mocks.authorAuth.mockResolvedValue(auth);
    mocks.memberAuth.mockResolvedValue(auth);
    mocks.list.mockResolvedValue([]);
    mocks.latest.mockResolvedValue(null);
  });

  it('lists the organization library and restores the author’s latest manifest', async () => {
    mocks.list.mockResolvedValue([{ id: sourceIds[0], name: 'guide.pdf', status: 'ready' }]);
    mocks.latest.mockResolvedValue({
      id: 'manifest-1',
      version: 4,
      sourceIds: sourceIds.slice(0, 2),
    });

    const libraryResponse = await getSources(request(`/api/source-library?orgId=${orgId}`));
    const manifestResponse = await getManifest(request(`/api/source-manifests?orgId=${orgId}`));

    expect(libraryResponse.status).toBe(200);
    expect(await libraryResponse.json()).toMatchObject({
      success: true,
      sources: [{ id: sourceIds[0], status: 'ready' }],
    });
    expect(await manifestResponse.json()).toMatchObject({
      success: true,
      manifest: { version: 4, sourceIds: sourceIds.slice(0, 2) },
    });
    expect(mocks.list).toHaveBeenCalledWith(orgId);
    expect(mocks.latest).toHaveBeenCalledWith(orgId, 'author-1');
  });

  it('accepts three sources, reuses a duplicate and rejects an unreadable document', async () => {
    const baseBody = {
      orgId,
      mimeType: 'application/pdf',
      sizeBytes: 1200,
      parserId: 'unpdf',
      content: { text: 'Contenu exploitable', images: [] },
    };
    for (const [index, sourceId] of sourceIds.entries()) {
      mocks.ingest.mockResolvedValueOnce({
        source: { id: sourceId, name: `source-${index + 1}.pdf`, status: 'ready' },
        duplicate: index === 2,
      });
      const response = await postSource(
        request('/api/source-library', 'POST', { ...baseBody, name: `source-${index + 1}.pdf` }),
      );
      expect(response.status).toBe(index === 2 ? 200 : 201);
      expect(await response.json()).toMatchObject({ success: true, duplicate: index === 2 });
    }

    mocks.ingest.mockRejectedValueOnce(new Error('SOURCE_TEXT_EMPTY'));
    const rejected = await postSource(
      request('/api/source-library', 'POST', {
        ...baseBody,
        name: 'scan-vide.pdf',
        content: { text: '', images: [] },
      }),
    );
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ code: 'SOURCE_REJECTED' });
  });

  it('versions a three-source selection atomically and preserves the valid version on rejection', async () => {
    const versionFour = { id: 'manifest-4', version: 4, sourceIds: sourceIds.slice(0, 2) };
    const versionFive = { id: 'manifest-5', version: 5, sourceIds };
    mocks.replace.mockResolvedValueOnce(versionFive);

    const accepted = await putManifest(
      request('/api/source-manifests', 'PUT', {
        orgId,
        sourceIds,
        expectedVersion: versionFour.version,
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ manifest: versionFive });
    expect(mocks.replace).toHaveBeenCalledWith({
      orgId,
      ownerId: 'author-1',
      sourceIds,
      expectedVersion: 4,
    });

    mocks.replace.mockRejectedValueOnce(
      new Error(
        'Every selected source must be unique, ready and owned by the manifest organization',
      ),
    );
    mocks.latest.mockResolvedValueOnce(versionFive);
    const rejected = await putManifest(
      request('/api/source-manifests', 'PUT', {
        orgId,
        sourceIds: [...sourceIds.slice(0, 2), '44444444-4444-4444-8444-444444444444'],
        expectedVersion: 5,
      }),
    );
    expect(rejected.status).toBe(400);
    const stillCurrent = await getManifest(request(`/api/source-manifests?orgId=${orgId}`));
    expect(await stillCurrent.json()).toMatchObject({ manifest: versionFive });
  });

  it('does not touch storage when authorization rejects a cross-tenant request', async () => {
    mocks.authorAuth.mockResolvedValueOnce({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await postSource(
      request('/api/source-library', 'POST', {
        orgId,
        name: 'foreign.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 42,
        parserId: 'unpdf',
        content: { text: 'Foreign tenant', images: [] },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
});
