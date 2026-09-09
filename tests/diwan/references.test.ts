import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pinDiwanSelection, resolveDiwanReferences } from '@/lib/diwan/references';
import { buildSceneSourceGrounding } from '@/lib/generation/source-grounding';
const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/diwan/client', async (original) => ({
  ...(await original<typeof import('@/lib/diwan/client')>()),
  executeDiwanCommand: call,
}));
const ref = {
  corpusId: 'corpus:1',
  sourceId: 'source:1',
  sourceVersion: 'version:1',
  checksumSha256: `sha256:${'a'.repeat(64)}`,
  title: 'SIPOC',
};
const chunk = {
  sourceId: ref.sourceId,
  sourceVersion: ref.sourceVersion,
  sourceChecksumSha256: ref.checksumSha256,
  chunkId: 'actual:chunk:12',
  content: 'Le SIPOC décrit les fournisseurs et les clients du processus.',
  contentHash: 'content-hash',
  pageNumber: 12,
};
describe('pinned Diwan source references', () => {
  beforeEach(() => {
    call.mockReset();
  });
  it('pins only provenance obtained from the tenant-scoped provider', async () => {
    call.mockResolvedValue({ sources: [{ ...ref, status: 'ready' }] });
    await expect(
      pinDiwanSelection('org', [{ corpusId: ref.corpusId, sourceId: ref.sourceId }]),
    ).resolves.toEqual([ref]);
    expect(call).toHaveBeenCalledWith('org', { operation: 'manifest', sourceIds: [ref.sourceId] });
    await expect(pinDiwanSelection('org', [ref])).rejects.toBeDefined();
  });
  it.each(['embedding', 'failed'])('refuses an unready source: %s', async (status) => {
    call.mockResolvedValue({ sources: [{ ...ref, status }] });
    await expect(
      pinDiwanSelection('org', [{ corpusId: ref.corpusId, sourceId: ref.sourceId }]),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('retains native citations and page metadata through scene grounding', async () => {
    call.mockResolvedValue({ status: 'ok', evidence: [chunk] });
    const documents = await resolveDiwanReferences('org', [ref], 'Expliquer le SIPOC');
    const grounding = buildSceneSourceGrounding(
      {
        id: 'scene',
        type: 'slide',
        title: 'SIPOC',
        description: 'Fournisseurs et clients',
        keyPoints: [],
        order: 1,
      },
      documents,
    );
    expect(grounding?.passages[0]).toMatchObject({
      id: chunk.chunkId,
      sourceId: ref.sourceId,
      sourceVersion: ref.sourceVersion,
      checksumSha256: ref.checksumSha256,
      pageNumber: 12,
    });
    expect(documents[0].text).toBe(chunk.content);
    expect(call).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        corpusId: ref.corpusId,
        sourceIds: [ref.sourceId],
        query: 'Expliquer le SIPOC',
      }),
    );
  });
  it.each([
    { ...chunk, sourceVersion: 'version:2' },
    { ...chunk, sourceChecksumSha256: `sha256:${'b'.repeat(64)}` },
  ])(
    'rejects changed source versions and checksums rather than silently replacing them',
    async (changed) => {
      call.mockResolvedValue({ status: 'ok', evidence: [changed] });
      await expect(resolveDiwanReferences('org', [ref], 'SIPOC')).rejects.toMatchObject({
        code: 'DIWAN_SOURCE_VERSION_CHANGED',
      });
    },
  );
  it('does not drop unsupported selected sources or fall back after a provider error', async () => {
    call.mockResolvedValue({ status: 'insufficient_evidence', evidence: [] });
    await expect(resolveDiwanReferences('org', [ref], 'SIPOC')).rejects.toMatchObject({
      code: 'DIWAN_INSUFFICIENT_EVIDENCE',
    });
    const failure = new Error('Provider unavailable');
    call.mockRejectedValue(failure);
    await expect(resolveDiwanReferences('org', [ref], 'SIPOC')).rejects.toBe(failure);
  });
  it('avoids all network access for empty selections and refuses missing queries', async () => {
    await expect(resolveDiwanReferences('org', [])).resolves.toEqual([]);
    await expect(pinDiwanSelection('org', [])).resolves.toEqual([]);
    await expect(resolveDiwanReferences('org', [ref])).rejects.toMatchObject({
      code: 'DIWAN_QUERY_REQUIRED',
    });
    expect(call).not.toHaveBeenCalled();
  });
});
