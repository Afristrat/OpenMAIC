import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSceneSourceGrounding } from '@/lib/generation/source-grounding';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), diwan: vi.fn() }));
vi.mock('@/lib/diwan/client', async (original) => ({
  ...(await original<typeof import('@/lib/diwan/client')>()),
  executeDiwanCommand: mocks.diwan,
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabaseClient: mocks.createClient,
}));

import {
  replaceSourceManifest,
  resolveFormationSources,
} from '@/lib/server/formation-source-library';

function selectChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.in = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('formation source resolution', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not silently refresh an already pinned source while editing the selection', async () => {
    const ref = {
      corpusId: 'corpus:1',
      sourceId: 'source:1',
      sourceVersion: 'version:1',
      checksumSha256: `sha256:${'a'.repeat(64)}`,
      title: 'SIPOC',
    };
    const rpc = vi.fn();
    mocks.createClient.mockReturnValue({
      rpc,
      from: () =>
        selectChain({
          data: {
            id: 'manifest',
            version: 1,
            source_ids: [],
            diwan_references: [ref],
            previous_manifest_id: null,
            created_at: '',
          },
          error: null,
        }),
    });
    mocks.diwan.mockResolvedValue({
      sources: [{ ...ref, sourceVersion: 'version:2', status: 'ready' }],
    });
    await expect(
      replaceSourceManifest({
        orgId: 'org',
        ownerId: 'owner',
        sourceIds: [],
        expectedVersion: 1,
        diwanSources: [{ corpusId: ref.corpusId, sourceId: ref.sourceId }],
      }),
    ).rejects.toMatchObject({ code: 'DIWAN_SOURCE_VERSION_CHANGED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('restores three sources in manifest order with stable identities and visible contradictions', async () => {
    const orgId = '432f141e-f1d3-4ed9-bad3-6768100802a4';
    const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sourceIds = ['source-a', 'source-b', 'source-c'];
    const manifest = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      org_id: orgId,
      owner_id: ownerId,
      version: 7,
      source_ids: sourceIds,
      previous_manifest_id: null,
      created_at: '2026-08-27T12:00:00.000Z',
    };
    const sourceRows = [
      {
        id: 'source-c',
        org_id: orgId,
        owner_id: null, // A tenant source survives deletion of its uploader.
        name: 'Annexe.md',
        mime_type: 'text/markdown',
        size_bytes: 80,
        content_hash: 'c'.repeat(64),
        parser_id: 'native',
        text_content: 'Annexe sans valeur financière.',
        images: [],
        status: 'ready',
        rejection_reason: null,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'source-b',
        org_id: orgId,
        owner_id: ownerId,
        name: 'Politique B.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
        content_hash: 'b'.repeat(64),
        parser_id: 'unpdf',
        text_content:
          'La marge contributive cible du magasin pilote est fixée à 45 % du chiffre d’affaires annuel.',
        images: [],
        status: 'ready',
        rejection_reason: null,
        created_at: '',
        updated_at: '',
      },
      {
        id: 'source-a',
        org_id: orgId,
        owner_id: ownerId,
        name: 'Politique A.pdf',
        mime_type: 'application/pdf',
        size_bytes: 100,
        content_hash: 'a'.repeat(64),
        parser_id: 'unpdf',
        text_content:
          'La marge contributive cible du magasin pilote est fixée à 30 % du chiffre d’affaires annuel.',
        images: [],
        status: 'ready',
        rejection_reason: null,
        created_at: '',
        updated_at: '',
      },
    ];
    const manifestQuery = selectChain({ data: manifest, error: null });
    const sourcesQuery = selectChain({ data: sourceRows, error: null });
    mocks.createClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'formation_source_manifests' ? manifestQuery : sourcesQuery,
      ),
    });

    const first = await resolveFormationSources({ orgId, ownerId, sourceManifestId: manifest.id });
    const second = await resolveFormationSources({ orgId, ownerId, sourceManifestId: manifest.id });

    expect(first.manifest).toMatchObject({ id: manifest.id, version: 7, sourceIds });
    expect(first.contents.map((source) => source.name)).toEqual([
      'Politique A.pdf',
      'Politique B.pdf',
      'Annexe.md',
    ]);
    expect(first.documents.map((source) => source.id)).toEqual(sourceIds);
    expect(first.documents.map((source) => source.version)).toEqual([
      `sha256-${'a'.repeat(64)}`,
      `sha256-${'b'.repeat(64)}`,
      `sha256-${'c'.repeat(64)}`,
    ]);
    expect(second.documents).toEqual(first.documents);
    expect(first.combinedContent?.text).toContain('SOURCE 1: Politique A.pdf');
    expect(first.combinedContent?.text).toContain('SOURCE 3: Annexe.md');

    const grounding = buildSceneSourceGrounding(
      {
        id: 'scene-margin',
        type: 'slide',
        title: 'Marge contributive',
        description: 'Comparer la marge contributive cible du magasin.',
        keyPoints: ['marge contributive', 'objectif magasin'],
        order: 1,
      },
      first.documents,
    );
    expect(grounding?.status).toBe('contradictory');
    expect(grounding?.issues[0]?.passageIds).toEqual(
      expect.arrayContaining([
        expect.stringContaining('source-a'),
        expect.stringContaining('source-b'),
      ]),
    );
  });

  it('preserves legacy single-source and no-source behavior', async () => {
    mocks.createClient.mockReturnValue({ from: vi.fn() });
    const none = await resolveFormationSources({ orgId: 'org', ownerId: 'owner' });
    const single = await resolveFormationSources({
      orgId: 'org',
      ownerId: 'owner',
      legacySource: { name: 'guide.pdf', text: 'Texte stable', images: [] },
    });
    expect(none).toEqual({ contents: [], documents: [] });
    expect(single.contents).toHaveLength(1);
    expect(single.combinedContent?.name).toBe('guide.pdf');
    expect(single.documents[0]?.id).toMatch(/^uploaded-/);
    expect(single.documents[0]?.version).toMatch(/^v1-[0-9a-f]{8}$/);
  });
  it('resolves a Diwan-only persisted manifest without reading or storing complete source documents', async () => {
    const reference = {
      corpusId: 'corpus:1',
      sourceId: 'source:1',
      sourceVersion: 'version:1',
      checksumSha256: `sha256:${'a'.repeat(64)}`,
      title: 'SIPOC',
    };
    const manifest = {
      id: 'manifest',
      org_id: 'org',
      owner_id: 'owner',
      version: 1,
      source_ids: [],
      diwan_references: [reference],
      previous_manifest_id: null,
      created_at: '',
    };
    const manifestQuery = selectChain({ data: manifest, error: null });
    const from = vi.fn(() => manifestQuery);
    mocks.createClient.mockReturnValue({ from });
    mocks.diwan.mockResolvedValue({
      status: 'ok',
      evidence: [
        {
          sourceId: reference.sourceId,
          sourceVersion: reference.sourceVersion,
          sourceChecksumSha256: reference.checksumSha256,
          chunkId: 'chunk:actual',
          content: 'Extrait SIPOC',
          contentHash: null,
          pageNumber: 4,
        },
      ],
    });
    const result = await resolveFormationSources({
      orgId: 'org',
      ownerId: 'owner',
      sourceManifestId: 'manifest',
      requirement: 'SIPOC',
    });
    expect(result.manifest?.diwanReferences).toEqual([reference]);
    expect(result.contents).toEqual([{ name: 'SIPOC', text: 'Extrait SIPOC', images: [] }]);
    expect(result.documents[0].passages?.[0].id).toBe('chunk:actual');
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('formation_source_manifests');
    expect(manifestQuery.eq).toHaveBeenCalledWith('org_id', 'org');
    expect(manifestQuery.eq).toHaveBeenCalledWith('owner_id', 'owner');
  });
});
