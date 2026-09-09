import { z } from 'zod';
import { DiwanError, executeDiwanCommand } from './client';
import type { SourceDocument } from '@/lib/generation/source-grounding';

const identifier = z.string().trim().min(1).max(512);
export const diwanSelection = z
  .array(z.object({ corpusId: identifier, sourceId: identifier }).strict())
  .max(20)
  .refine((items) => new Set(items.map((item) => item.sourceId)).size === items.length);
export const diwanReferences = z
  .array(
    z
      .object({
        corpusId: identifier,
        sourceId: identifier,
        sourceVersion: identifier,
        checksumSha256: z.string().regex(/^sha256:[0-9a-f]{64}$/),
        title: identifier,
      })
      .strict(),
  )
  .max(20)
  .refine((items) => new Set(items.map((item) => item.sourceId)).size === items.length);
export type DiwanReference = z.infer<typeof diwanReferences>[number];

/** Trust only provider-returned versions and checksums, never browser-supplied provenance. */
export async function pinDiwanSelection(orgId: string, input: unknown): Promise<DiwanReference[]> {
  const selected = diwanSelection.parse(input);
  if (selected.length === 0) return [];
  const manifest = await executeDiwanCommand(orgId, {
    operation: 'manifest',
    sourceIds: selected.map((item) => item.sourceId),
  });
  if (!('sources' in manifest)) throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
  return diwanReferences.parse(
    selected.map((item) => {
      const source = manifest.sources.find((entry) => entry.sourceId === item.sourceId);
      if (!source || source.status !== 'ready' || !('title' in source))
        throw new DiwanError(409, 'DIWAN_SOURCE_NOT_READY');
      return {
        ...item,
        sourceVersion: source.sourceVersion,
        checksumSha256: source.checksumSha256,
        title: source.title?.trim().slice(0, 512) || source.sourceId,
      };
    }),
  );
}

/** Retrieve scoped excerpts at generation time; an unavailable/revised source never falls back to Web. */
export async function resolveDiwanReferences(
  orgId: string,
  input: unknown,
  query?: string,
): Promise<SourceDocument[]> {
  const refs = diwanReferences.parse(input);
  if (refs.length === 0) return [];
  if (!query?.trim()) throw new DiwanError(400, 'DIWAN_QUERY_REQUIRED');
  const documents: SourceDocument[] = [];
  // Bounded sequential retrieval avoids multiplying service requests and response buffers.
  for (const corpusId of new Set(refs.map((ref) => ref.corpusId))) {
    const scoped = refs.filter((ref) => ref.corpusId === corpusId);
    const result = await executeDiwanCommand(orgId, {
      operation: 'retrieve',
      corpusId,
      sourceIds: scoped.map((ref) => ref.sourceId),
      query,
      limit: 50,
    });
    if (!('evidence' in result)) throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
    if (result.status === 'insufficient_evidence')
      throw new DiwanError(409, 'DIWAN_INSUFFICIENT_EVIDENCE');
    for (const ref of scoped) {
      const chunks = result.evidence.filter((chunk) => chunk.sourceId === ref.sourceId);
      if (chunks.length === 0) throw new DiwanError(409, 'DIWAN_INSUFFICIENT_EVIDENCE');
      if (
        chunks.some(
          (chunk) =>
            chunk.sourceVersion !== ref.sourceVersion ||
            chunk.sourceChecksumSha256 !== ref.checksumSha256,
        )
      )
        throw new DiwanError(409, 'DIWAN_SOURCE_VERSION_CHANGED');
      if (new Set(chunks.map((chunk) => chunk.chunkId)).size !== chunks.length)
        throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
      documents.push({
        id: ref.sourceId,
        version: ref.sourceVersion,
        title: ref.title,
        text: chunks.map((chunk) => chunk.content).join('\n\n'),
        passages: chunks.map((chunk) => ({
          id: chunk.chunkId,
          sourceId: ref.sourceId,
          sourceVersion: ref.sourceVersion,
          sourceTitle: ref.title,
          text: chunk.content,
          start: 0,
          end: chunk.content.length,
          checksumSha256: ref.checksumSha256,
          contentHash: chunk.contentHash,
          pageNumber: chunk.pageNumber,
        })),
      });
    }
  }
  return refs.map((ref) => documents.find((document) => document.id === ref.sourceId)!);
}
