import { z } from 'zod';

// Server-side adapter only. Tokens are never accepted from callers or returned in errors.
const BASE = 'https://diwan.ai-mpower.com/api/v1/consumers/qalem';
const id = z.string().trim().min(1).max(512);
const count = z.number().int().nonnegative();
const ingestionStatus = z.enum([
  'queued',
  'extracting',
  'chunking',
  'embedding',
  'ready',
  'partially_failed',
  'failed',
]);
const envelope = z.object({ contractVersion: z.literal('1.0'), requestId: id });
const source = z.object({
  sourceId: id,
  sourceVersion: id,
  status: id,
  checksumSha256: z.string().nullable(),
});
const evidence = z.object({
  chunkId: id,
  sourceId: id,
  sourceVersion: id,
  sourceTitle: z.string().nullable(),
  pageNumber: count.nullable(),
  sectionTitle: z.string().nullable(),
  content: z.string().max(131072),
  score: z.number().finite(),
  contentHash: z.string().nullable(),
  sourceChecksumSha256: z.string().nullable(),
});
const sourceIds = z.array(id).min(1).max(100);
export const diwanCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status'), jobId: id }).strict(),
  z.object({ operation: z.literal('manifest'), sourceIds }).strict(),
  z
    .object({
      operation: z.literal('retrieve'),
      corpusId: id,
      sourceIds,
      query: z.string().trim().min(1).max(16000),
      limit: z.number().int().min(1).max(50).default(12),
      minimumScore: z.number().min(0).max(1).default(0.35),
      searchMode: z.enum(['hybrid', 'vector', 'text']).default('hybrid'),
    })
    .strict(),
  z.object({ operation: z.literal('revoke'), corpusId: id }).strict(),
]);
export const diwanListQuery = z
  .object({
    corpusId: id.optional(),
    status: id.optional(),
    query: id.optional(),
    mediaType: id.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export class DiwanError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

/** Bound actual decoded bytes (not Content-Length) and the entire stream lifetime. */
export async function readDiwanBytes(
  stream: ReadableStream<Uint8Array> | null,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!stream) throw new DiwanError(400, 'EMPTY_BODY');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new DiwanError(413, 'BODY_TOO_LARGE');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function tenantToken(organizationId: string): string {
  // No default/global credential: an unconfigured tenant must fail closed.
  try {
    const org = z.uuid().parse(organizationId).toLowerCase();
    const tokens = z
      .record(
        z.uuid(),
        z
          .string()
          .min(16)
          .max(4096)
          .regex(/^[\x21-\x7e]+$/),
      )
      .parse(JSON.parse(process.env.QALEM_DIWAN_TENANT_TOKENS || '{}'));
    const entries = Object.entries(tokens);
    const matching = entries.filter(([key]) => key.toLowerCase() === org);
    if (matching.length !== 1) throw new Error();
    const token = matching[0][1];
    if (entries.filter(([, value]) => value === token).length !== 1) throw new Error();
    return token;
  } catch {
    throw new DiwanError(503, 'DIWAN_TENANT_NOT_CONFIGURED');
  }
}

async function request<T>(
  organizationId: string,
  path: string,
  schema: z.ZodType<T>,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: FormData | object,
): Promise<T> {
  const token = tenantToken(organizationId);
  const signal = AbortSignal.timeout(15000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      redirect: 'error',
      cache: 'no-store',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = [403, 404, 409, 413, 415, 422, 429].includes(response.status)
        ? response.status
        : 502;
      throw new DiwanError(status, 'DIWAN_REQUEST_REJECTED');
    }
    if (
      response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json'
    ) {
      await response.body?.cancel();
      throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
    }
    const bytes = await readDiwanBytes(response.body, 2 * 1024 * 1024, signal);
    const parsed = schema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (!parsed.success) throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
    return parsed.data;
  } catch (error) {
    if (signal.aborted) throw new DiwanError(504, 'DIWAN_TIMEOUT');
    if (error instanceof DiwanError) {
      if (error.code === 'BODY_TOO_LARGE') throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
      throw error;
    }
    throw new DiwanError(502, 'DIWAN_UNAVAILABLE_OR_INVALID');
  }
}

/** organizationId must have passed the server's organization author permission check. */
export function listDiwanSources(organizationId: string, input: unknown) {
  const query = diwanListQuery.parse(input);
  const params = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  return request(
    organizationId,
    `/sources?${params}`,
    envelope.extend({
      items: z
        .array(
          source.extend({
            corpusId: id,
            title: z.string().nullable(),
            originalName: z.string().nullable(),
            mediaType: z.string().nullable(),
            pages: count.nullable(),
            chunks: count,
            createdAt: z.string(),
          }),
        )
        .max(100),
      pagination: z.object({ page: count, pageSize: count, total: count }),
    }),
  );
}

export async function executeDiwanCommand(organizationId: string, input: unknown) {
  const command = diwanCommand.parse(input);
  if (command.operation === 'status')
    return request(
      organizationId,
      `/ingestions/${encodeURIComponent(command.jobId)}`,
      envelope.extend({
        jobId: z.literal(command.jobId),
        corpusId: id,
        status: z.enum([
          'queued',
          'extracting',
          'chunking',
          'embedding',
          'ready',
          'partially_failed',
          'failed',
        ]),
        progress: count.max(100),
        pollAfterSeconds: count,
        sources: z.array(
          source.extend({
            originalName: z.string(),
            pages: count.nullable(),
            chunks: count,
            errorCode: z.string().nullable(),
            errorMessage: z.string().nullable(),
          }),
        ),
      }),
    );
  if (command.operation === 'revoke')
    return request(
      organizationId,
      `/corpora/${encodeURIComponent(command.corpusId)}`,
      envelope.extend({
        corpusId: z.literal(command.corpusId),
        status: z.literal('revoked'),
      }),
      'DELETE',
    );
  if (command.operation === 'manifest') {
    const result = await request(
      organizationId,
      '/sources/manifest',
      envelope.extend({
        sources: z.array(
          source.extend({
            title: z.string().nullable(),
            parser: z.object({ name: z.string().nullable(), version: z.string().nullable() }),
            embedding: z.object({
              model: z.string().nullable(),
              version: z.string().nullable(),
              chunks: count,
            }),
          }),
        ),
      }),
      'POST',
      { sourceIds: command.sourceIds },
    );
    const returned = new Set(result.sources.map((item) => item.sourceId));
    if (
      returned.size !== result.sources.length ||
      returned.size !== new Set(command.sourceIds).size ||
      command.sourceIds.some((item) => !returned.has(item))
    )
      throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
    return result;
  }
  const { operation: _operation, ...body } = command;
  const result = await request(
    organizationId,
    '/retrieve',
    envelope.extend({
      status: z.enum(['ok', 'insufficient_evidence']),
      query: z.string(),
      evidence: z.array(evidence).max(command.limit),
    }),
    'POST',
    body,
  );
  if (
    result.evidence.some((item) => !command.sourceIds.includes(item.sourceId)) ||
    (result.status === 'insufficient_evidence' && result.evidence.length !== 0) ||
    (result.status === 'ok' && result.evidence.length === 0)
  )
    throw new DiwanError(502, 'DIWAN_INVALID_RESPONSE');
  return result;
}

export function ingestDiwanSources(organizationId: string, form: FormData) {
  const allowed = new Set([
    'files',
    'urls',
    'texts',
    'titles',
    'corpusId',
    'corpusName',
    'idempotencyKey',
  ]);
  if ([...form.keys()].some((key) => !allowed.has(key)))
    throw new DiwanError(400, 'INVALID_INGESTION');
  for (const key of ['corpusId', 'corpusName', 'idempotencyKey']) {
    if (form.getAll(key).length > 1) throw new DiwanError(400, 'INVALID_INGESTION');
  }
  if (!id.safeParse(form.get('idempotencyKey')).success)
    throw new DiwanError(400, 'INVALID_INGESTION');
  const files = form.getAll('files');
  const urls = form.getAll('urls');
  const texts = form.getAll('texts');
  if (
    files.length + urls.length + texts.length === 0 ||
    files.length + urls.length + texts.length > 20
  )
    throw new DiwanError(400, 'INVALID_INGESTION');
  let bytes = 0;
  for (const [key, value] of form) {
    if (key === 'files') {
      if (typeof value === 'string' || value.size === 0)
        throw new DiwanError(400, 'INVALID_INGESTION');
      bytes += value.size;
    } else {
      if (typeof value !== 'string' || !value.trim())
        throw new DiwanError(400, 'INVALID_INGESTION');
      bytes += Buffer.byteLength(value);
      if (
        key === 'urls' &&
        (!URL.canParse(value) || !['https:', 'http:'].includes(new URL(value).protocol))
      )
        throw new DiwanError(400, 'INVALID_INGESTION');
    }
  }
  if (bytes > 50 * 1024 * 1024) throw new DiwanError(413, 'BODY_TOO_LARGE');
  return request(
    organizationId,
    '/ingestions',
    envelope.extend({
      jobId: id,
      corpusId: id,
      status: ingestionStatus,
      submittedSources: count.min(1),
      pollAfterSeconds: count,
    }),
    'POST',
    form,
  );
}
