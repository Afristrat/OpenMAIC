import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeDiwanCommand,
  ingestDiwanSources,
  listDiwanSources,
  readDiwanBytes,
} from '@/lib/diwan/client';

const org = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const token = 'synthetic-diwan-test-token';
const envelope = { contractVersion: '1.0', requestId: 'request:1' };
const command = {
  operation: 'retrieve',
  corpusId: 'corpus:1',
  sourceIds: ['source:1'],
  query: 'SIPOC',
};
const hit = {
  chunkId: 'chunk:1',
  sourceId: 'source:1',
  sourceVersion: 'version:1',
  sourceTitle: 'Titre',
  pageNumber: 1,
  sectionTitle: null,
  content: 'État vérifié',
  score: 0.8,
  contentHash: 'hash',
  sourceChecksumSha256: 'sha256:hash',
};
const fetchMock = vi.fn();
const reply = (body: unknown) => Response.json(body);
describe('Diwan v1 tenant-scoped adapter', () => {
  beforeEach(() => {
    vi.stubEnv('QALEM_DIWAN_TENANT_TOKENS', JSON.stringify({ [org]: token }));
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it('requires an explicit unique tenant credential before any network access', async () => {
    await expect(listDiwanSources(other, {})).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('QALEM_DIWAN_TENANT_TOKENS', JSON.stringify({ [org]: token, [other]: token }));
    await expect(listDiwanSources(org, {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends only the whitelist and dedicated credential to the fixed HTTPS origin', async () => {
    fetchMock.mockResolvedValue(
      reply({ ...envelope, status: 'ok', query: 'SIPOC', evidence: [hit], secretExtra: token }),
    );
    const result = await executeDiwanCommand(org, command);
    expect(result).not.toHaveProperty('secretExtra');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://diwan.ai-mpower.com/api/v1/consumers/qalem/retrieve',
      expect.objectContaining({
        redirect: 'error',
        cache: 'no-store',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('organizationId');
  });
  it.each([
    { ...envelope, status: 'ok', query: 'SIPOC', evidence: [{ ...hit, sourceId: 'source:other' }] },
    { ...envelope, status: 'insufficient_evidence', query: 'SIPOC', evidence: [hit] },
    { ...envelope, contractVersion: '2.0', status: 'ok', query: 'SIPOC', evidence: [hit] },
    { ...envelope, status: 'ok', query: 'SIPOC', evidence: [] },
  ])('rejects invalid provenance, version or evidence state', async (body) => {
    fetchMock.mockResolvedValue(reply(body));
    await expect(executeDiwanCommand(org, command)).rejects.toMatchObject({ status: 502 });
  });
  it('preserves absence of evidence without fabricating fallback content', async () => {
    fetchMock.mockResolvedValue(
      reply({ ...envelope, status: 'insufficient_evidence', query: 'SIPOC', evidence: [] }),
    );
    await expect(executeDiwanCommand(org, command)).resolves.toMatchObject({
      status: 'insufficient_evidence',
      evidence: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([403, 409, 429, 503])('sanitizes upstream error %s without retry', async (status) => {
    fetchMock.mockResolvedValue(new Response(token, { status }));
    await expect(executeDiwanCommand(org, command)).rejects.toMatchObject({
      code: 'DIWAN_REQUEST_REJECTED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('bounds the complete request lifetime', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error(token)), { once: true });
        }),
    );
    // Node AbortSignal.timeout uses native timers; inject a controllable signal for this boundary.
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const assertion = expect(executeDiwanCommand(org, command)).rejects.toMatchObject({
      status: 504,
      code: 'DIWAN_TIMEOUT',
    });
    controller.abort();
    await assertion;
    timeout.mockRestore();
  });
  it('cancels oversized and stalled response streams', async () => {
    const cancel = vi.fn();
    await expect(
      readDiwanBytes(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(5));
          },
          cancel,
        }),
        4,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalled();
    const controller = new AbortController();
    const stalled = readDiwanBytes(new ReadableStream(), 4, controller.signal);
    const assertion = expect(stalled).rejects.toBeDefined();
    controller.abort();
    await assertion;
  });
  it('refuses missing whitelists and tenant injection', async () => {
    await expect(executeDiwanCommand(org, { ...command, sourceIds: [] })).rejects.toBeDefined();
    await expect(
      executeDiwanCommand(org, { ...command, organizationId: other }),
    ).rejects.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('submits multipart idempotently and rejects unrecognized form fields', async () => {
    const form = new FormData();
    form.set('texts', 'Contenu autorisé');
    form.set('idempotencyKey', 'unique-import');
    fetchMock.mockResolvedValue(
      reply({
        ...envelope,
        jobId: 'job:1',
        corpusId: 'corpus:1',
        status: 'queued',
        submittedSources: 1,
        pollAfterSeconds: 30,
      }),
    );
    await expect(ingestDiwanSources(org, form)).resolves.toMatchObject({ status: 'queued' });
    expect(fetchMock.mock.calls[0][1].body).toBe(form);
    form.set('organizationId', other);
    expect(() => ingestDiwanSources(org, form)).toThrow();
  });
  it('checks exact revoked corpus and manifest source membership', async () => {
    fetchMock.mockResolvedValue(
      reply({ ...envelope, corpusId: 'corpus:other', status: 'revoked' }),
    );
    await expect(
      executeDiwanCommand(org, { operation: 'revoke', corpusId: 'corpus:1' }),
    ).rejects.toMatchObject({ status: 502 });
    fetchMock.mockResolvedValue(reply({ ...envelope, sources: [] }));
    await expect(
      executeDiwanCommand(org, { operation: 'manifest', sourceIds: ['source:1'] }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('accepts the real contract replay state after a previously completed import', async () => {
    const form = new FormData();
    form.set('texts', 'Même document');
    form.set('idempotencyKey', 'same-import');
    fetchMock.mockResolvedValue(
      reply({
        ...envelope,
        jobId: 'job:1',
        corpusId: 'corpus:1',
        status: 'ready',
        submittedSources: 1,
        pollAfterSeconds: 30,
      }),
    );
    await expect(ingestDiwanSources(org, form)).resolves.toMatchObject({ status: 'ready' });
  });
  it('rejects invalid JSON, oversized responses, HTML and transport failures without leaking detail', async () => {
    for (const response of [
      new Response(token, { headers: { 'content-type': 'application/json' } }),
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'application/json' },
      }),
      new Response('<html>private detail</html>'),
    ]) {
      fetchMock.mockResolvedValue(response);
      await expect(executeDiwanCommand(org, command)).rejects.toMatchObject({ status: 502 });
    }
    fetchMock.mockRejectedValue(new Error(token));
    await expect(executeDiwanCommand(org, command)).rejects.toMatchObject({
      message: 'DIWAN_UNAVAILABLE_OR_INVALID',
    });
  });
  const alignment = {
    ...envelope,
    status: 'aligned',
    coverageScore: 0.8,
    requestTopic: 'SIPOC',
    sourceTopics: [{ sourceId: 'source:1', topic: 'SIPOC' }],
    coveredRequirements: [{ requirement: 'Décrire le SIPOC', evidenceChunkIds: ['chunk:1'] }],
    missingRequirements: [],
    conflicts: [],
    recommendedAction: 'use_reformulated_request',
    suggestedRequirement: 'Décrire le SIPOC selon la source.',
  };
  const alignmentCommand = {
    operation: 'alignment',
    corpusId: 'corpus:1',
    sourceIds: ['source:1', 'source:2'],
    authorRequest: 'Expliquer le SIPOC',
  };
  const finding = {
    topic: 'Périmètre',
    explanation: 'Les positions diffèrent.',
    positions: [
      { sourceId: 'source:1', chunkIds: ['chunk:1'] },
      { sourceId: 'source:2', chunkIds: ['chunk:2'] },
    ],
  };
  it('forwards the alignment contract and preserves citations as advisory information', async () => {
    fetchMock.mockResolvedValue(reply(alignment));
    await expect(executeDiwanCommand(org, alignmentCommand)).resolves.toMatchObject({
      advisoryOnly: true,
      coveredRequirements: alignment.coveredRequirements,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://diwan.ai-mpower.com/api/v1/consumers/qalem/alignment',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      corpusId: 'corpus:1',
      sourceIds: ['source:1', 'source:2'],
      authorRequest: 'Expliquer le SIPOC',
      expectedLanguage: 'fr-FR',
    });
  });
  it.each([
    { ...alignment, coveredRequirements: [] },
    { ...alignment, coverageScore: 1.1 },
    { ...alignment, sourceTopics: [{ sourceId: 'foreign', topic: 'Autre' }] },
    { ...alignment, conflicts: [finding] },
    { ...alignment, status: 'conflicting', conflicts: [finding] },
    { ...alignment, suggestedRequirement: '' },
  ])('rejects unsupported or inconsistent alignment claims', async (body) => {
    fetchMock.mockResolvedValue(reply(body));
    await expect(executeDiwanCommand(org, alignmentCommand)).rejects.toMatchObject({ status: 502 });
  });
  it('requires author arbitration for a supported conflict', async () => {
    fetchMock.mockResolvedValue(
      reply({
        ...alignment,
        status: 'conflicting',
        conflicts: [finding],
        recommendedAction: 'author_arbitration',
      }),
    );
    await expect(executeDiwanCommand(org, alignmentCommand)).resolves.toMatchObject({
      status: 'conflicting',
      recommendedAction: 'author_arbitration',
      advisoryOnly: true,
    });
  });
  it('does not treat no_material_conflict as permission to generate', async () => {
    fetchMock.mockResolvedValue(
      reply({ ...envelope, status: 'no_material_conflict', conflicts: [] }),
    );
    await expect(
      executeDiwanCommand(org, {
        operation: 'conflicts',
        corpusId: 'corpus:1',
        sourceIds: ['source:1'],
      }),
    ).resolves.toMatchObject({ advisoryOnly: true });
  });
  it.each([
    { conflicts: [] },
    { conflicts: [{ ...finding, positions: [finding.positions[0], finding.positions[0]] }] },
    {
      conflicts: [
        {
          ...finding,
          positions: [finding.positions[0], { sourceId: 'foreign', chunkIds: ['chunk:2'] }],
        },
      ],
    },
    {
      conflicts: [
        {
          ...finding,
          positions: [finding.positions[0], { sourceId: 'source:2', chunkIds: ['chunk:1'] }],
        },
      ],
    },
  ])(
    'rejects conflicts without distinct authorized sources and citations',
    async ({ conflicts }) => {
      fetchMock.mockResolvedValue(reply({ ...envelope, status: 'conflicts_detected', conflicts }));
      await expect(
        executeDiwanCommand(org, {
          operation: 'conflicts',
          corpusId: 'corpus:1',
          sourceIds: ['source:1', 'source:2'],
        }),
      ).rejects.toMatchObject({ status: 502 });
    },
  );
});
