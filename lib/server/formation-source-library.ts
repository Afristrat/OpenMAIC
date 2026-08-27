import { createHash } from 'node:crypto';
import { uploadedSourceDocument, type SourceDocument } from '@/lib/generation/source-grounding';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { FormationSourceManifest, OrganizationSource } from '@/lib/supabase/types';
import type { PdfImage, PdfSourceContent } from '@/lib/types/generation';

const MAX_SELECTED_SOURCES = 20;

export interface SourceLibraryItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  parserId: string;
  status: 'ready' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
}

export interface SourceManifestSnapshot {
  id: string;
  version: number;
  sourceIds: string[];
  previousManifestId: string | null;
  createdAt: string;
}

export interface ResolvedFormationSources {
  manifest?: SourceManifestSnapshot;
  contents: PdfSourceContent[];
  documents: SourceDocument[];
  combinedContent?: PdfSourceContent;
}

function toLibraryItem(source: OrganizationSource): SourceLibraryItem {
  return {
    id: source.id,
    name: source.name,
    mimeType: source.mime_type,
    sizeBytes: source.size_bytes,
    contentHash: source.content_hash,
    parserId: source.parser_id,
    status: source.status,
    rejectionReason: source.rejection_reason,
    createdAt: source.created_at,
  };
}

function toManifestSnapshot(manifest: FormationSourceManifest): SourceManifestSnapshot {
  return {
    id: manifest.id,
    version: manifest.version,
    sourceIds: manifest.source_ids,
    previousManifestId: manifest.previous_manifest_id,
    createdAt: manifest.created_at,
  };
}

function sourceContentHash(text: string, images: PdfSourceContent['images'] = []): string {
  return createHash('sha256')
    .update(text.replace(/\r\n?/g, '\n').trim(), 'utf8')
    .update('\0', 'utf8')
    .update(JSON.stringify(images), 'utf8')
    .digest('hex');
}

export async function listOrganizationSources(orgId: string): Promise<SourceLibraryItem[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from('organization_sources')
    .select(
      'id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content, images, status, rejection_reason, created_at, updated_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list organization sources: ${error.message}`);
  return (data ?? []).map((source) => toLibraryItem(source as OrganizationSource));
}

export async function ingestOrganizationSource(input: {
  orgId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  parserId: string;
  content: PdfSourceContent;
}): Promise<{ source: SourceLibraryItem; duplicate: boolean }> {
  const text = input.content.text.replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('SOURCE_TEXT_EMPTY');
  const contentHash = sourceContentHash(text, input.content.images);
  const supabase = createServiceSupabaseClient();
  const { data: existing, error: lookupError } = await supabase
    .from('organization_sources')
    .select(
      'id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content, images, status, rejection_reason, created_at, updated_at',
    )
    .eq('org_id', input.orgId)
    .eq('content_hash', contentHash)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to check source duplicate: ${lookupError.message}`);
  if (existing) return { source: toLibraryItem(existing as OrganizationSource), duplicate: true };

  const { data, error } = await supabase
    .from('organization_sources')
    .insert({
      org_id: input.orgId,
      owner_id: input.ownerId,
      name: input.name.trim(),
      mime_type: input.mimeType.trim(),
      size_bytes: input.sizeBytes,
      content_hash: contentHash,
      parser_id: input.parserId.trim(),
      text_content: text,
      images: input.content.images,
      status: 'ready',
    })
    .select(
      'id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content, images, status, rejection_reason, created_at, updated_at',
    )
    .single();
  if (error) {
    // A concurrent upload of the same content may win after our lookup.
    if (error.code === '23505') {
      const { data: duplicate, error: duplicateError } = await supabase
        .from('organization_sources')
        .select(
          'id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content, images, status, rejection_reason, created_at, updated_at',
        )
        .eq('org_id', input.orgId)
        .eq('content_hash', contentHash)
        .single();
      if (!duplicateError && duplicate) {
        return { source: toLibraryItem(duplicate as OrganizationSource), duplicate: true };
      }
    }
    throw new Error(`Failed to persist organization source: ${error.message}`);
  }
  return { source: toLibraryItem(data as OrganizationSource), duplicate: false };
}

export async function readLatestSourceManifest(
  orgId: string,
  ownerId: string,
): Promise<SourceManifestSnapshot | null> {
  const { data, error } = await createServiceSupabaseClient()
    .from('formation_source_manifests')
    .select('id, org_id, owner_id, version, source_ids, previous_manifest_id, created_at')
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read source manifest: ${error.message}`);
  return data ? toManifestSnapshot(data as FormationSourceManifest) : null;
}

export async function replaceSourceManifest(input: {
  orgId: string;
  ownerId: string;
  sourceIds: string[];
  expectedVersion?: number;
}): Promise<SourceManifestSnapshot> {
  if (input.sourceIds.length > MAX_SELECTED_SOURCES) {
    throw new Error(`At most ${MAX_SELECTED_SOURCES} sources may be selected`);
  }
  if (new Set(input.sourceIds).size !== input.sourceIds.length) {
    throw new Error('Selected source identifiers must be unique');
  }
  const { data, error } = await createServiceSupabaseClient().rpc(
    'replace_formation_source_manifest',
    {
      p_org_id: input.orgId,
      p_owner_id: input.ownerId,
      p_source_ids: input.sourceIds,
      p_expected_version: input.expectedVersion ?? null,
    },
  );
  if (error) throw new Error(`Failed to replace source manifest: ${error.message}`);
  const manifest = data?.[0];
  if (!manifest) throw new Error('Source manifest replacement returned no version');
  return toManifestSnapshot(manifest);
}

function combineSourceContents(contents: PdfSourceContent[]): PdfSourceContent | undefined {
  if (contents.length === 0) return undefined;
  if (contents.length === 1) return contents[0];
  return {
    name: `${contents.length} sources sélectionnées`,
    text: contents
      .map(
        (source, index) =>
          `=== SOURCE ${index + 1}: ${source.name ?? 'Sans titre'} ===\n${source.text}`,
      )
      .join('\n\n'),
    images: contents.flatMap((source) => source.images),
  };
}

export async function resolveFormationSources(input: {
  orgId: string;
  ownerId: string;
  sourceManifestId?: string;
  legacySource?: PdfSourceContent;
}): Promise<ResolvedFormationSources> {
  if (!input.sourceManifestId) {
    if (!input.legacySource) return { contents: [], documents: [] };
    return {
      contents: [input.legacySource],
      combinedContent: input.legacySource,
      documents: [uploadedSourceDocument(input.legacySource)],
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data: manifest, error: manifestError } = await supabase
    .from('formation_source_manifests')
    .select('id, org_id, owner_id, version, source_ids, previous_manifest_id, created_at')
    .eq('id', input.sourceManifestId)
    .eq('org_id', input.orgId)
    .eq('owner_id', input.ownerId)
    .maybeSingle();
  if (manifestError) throw new Error(`Failed to resolve source manifest: ${manifestError.message}`);
  if (!manifest) throw new Error('Source manifest is unavailable in the current organization');

  const typedManifest = manifest as FormationSourceManifest;
  const selectedIds: string[] = typedManifest.source_ids;
  if (selectedIds.length === 0) {
    return { manifest: toManifestSnapshot(typedManifest), contents: [], documents: [] };
  }
  const { data: sourceRows, error: sourcesError } = await supabase
    .from('organization_sources')
    .select(
      'id, org_id, owner_id, name, mime_type, size_bytes, content_hash, parser_id, text_content, images, status, rejection_reason, created_at, updated_at',
    )
    .eq('org_id', input.orgId)
    .eq('status', 'ready')
    .in('id', selectedIds);
  if (sourcesError) throw new Error(`Failed to resolve selected sources: ${sourcesError.message}`);
  if ((sourceRows?.length ?? 0) !== selectedIds.length) {
    throw new Error('One or more selected sources are unavailable in the current organization');
  }

  const byId = new Map((sourceRows as OrganizationSource[]).map((source) => [source.id, source]));
  const ordered = selectedIds.map((sourceId) => byId.get(sourceId)!);
  const contents = ordered.map((source) => ({
    name: source.name,
    text: source.text_content,
    images: source.images as Array<string | PdfImage>,
  }));
  return {
    manifest: toManifestSnapshot(typedManifest),
    contents,
    combinedContent: combineSourceContents(contents),
    documents: ordered.map((source) => ({
      id: source.id,
      version: `sha256-${source.content_hash}`,
      title: source.name,
      text: source.text_content,
    })),
  };
}
