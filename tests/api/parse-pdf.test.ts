import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentArtifact } from '@/lib/document';

const mocks = vi.hoisted(() => ({
  extractDocument: vi.fn(),
  isServerConfiguredProvider: vi.fn(),
  resolvePDFApiKey: vi.fn(),
  resolvePDFBaseUrl: vi.fn(),
}));

vi.mock('@/lib/document', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/document')>()),
  extractDocument: mocks.extractDocument,
}));

vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: mocks.isServerConfiguredProvider,
  resolvePDFApiKey: mocks.resolvePDFApiKey,
  resolvePDFBaseUrl: mocks.resolvePDFBaseUrl,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function artifact(providerId: string, text: string): DocumentArtifact {
  return {
    metadata: { providerId, pageCount: 1 },
    blocks: text ? [{ id: `${providerId}-text`, type: 'text', text }] : [],
    assets: [],
  };
}

async function postPdf(providerId = 'unpdf', config: { apiKey?: string; baseUrl?: string } = {}) {
  const formData = new FormData();
  formData.set('pdf', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'source.pdf');
  formData.set('providerId', providerId);
  if (config.apiKey) formData.set('apiKey', config.apiKey);
  if (config.baseUrl) formData.set('baseUrl', config.baseUrl);

  const { POST } = await import('@/app/api/parse-pdf/route');
  return POST(
    new Request('http://localhost/api/parse-pdf', {
      method: 'POST',
      body: formData,
    }) as unknown as Parameters<typeof POST>[0],
  );
}

describe('POST /api/parse-pdf', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.extractDocument.mockReset();
    mocks.isServerConfiguredProvider.mockReset().mockReturnValue(false);
    mocks.resolvePDFApiKey.mockReset().mockImplementation((_providerId, apiKey) => apiKey);
    mocks.resolvePDFBaseUrl.mockReset().mockImplementation((_providerId, baseUrl) => baseUrl);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses the selected parser and its effective client configuration', async () => {
    mocks.extractDocument.mockResolvedValueOnce(artifact('mineru', 'Readable source text'));

    const response = await postPdf('mineru', {
      apiKey: 'client-key',
      baseUrl: 'https://mineru.example.test/v1',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { text: 'Readable source text' },
    });
    expect(mocks.extractDocument).toHaveBeenCalledTimes(1);
    expect(mocks.extractDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          providerId: 'mineru',
          apiKey: 'client-key',
          baseUrl: 'https://mineru.example.test/v1',
        },
      }),
    );
  });

  it('keeps readable unpdf text without invoking an OCR parser', async () => {
    mocks.isServerConfiguredProvider.mockImplementation(
      (_kind, providerId) => providerId === 'mineru',
    );
    mocks.extractDocument.mockResolvedValueOnce(artifact('unpdf', 'Native PDF text'));

    const response = await postPdf();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { text: 'Native PDF text' },
    });
    expect(mocks.extractDocument).toHaveBeenCalledTimes(1);
  });

  it('falls back from an unreadable unpdf result to a configured OCR parser', async () => {
    mocks.isServerConfiguredProvider.mockImplementation(
      (_kind, providerId) => providerId === 'mineru',
    );
    mocks.resolvePDFApiKey.mockImplementation((providerId) => `${providerId}-server-key`);
    mocks.resolvePDFBaseUrl.mockImplementation(
      (providerId) => `https://${providerId}.example.test/v1`,
    );
    mocks.extractDocument
      .mockResolvedValueOnce(artifact('unpdf', ''))
      .mockResolvedValueOnce(artifact('mineru', 'OCR text'));

    const response = await postPdf();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { text: 'OCR text' },
    });
    expect(mocks.extractDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        config: {
          providerId: 'mineru',
          apiKey: 'mineru-server-key',
          baseUrl: 'https://mineru.example.test/v1',
        },
      }),
    );
  });

  it('returns a distinct contract error when no configured parser extracts readable text', async () => {
    mocks.isServerConfiguredProvider.mockImplementation(
      (_kind, providerId) => providerId === 'mineru',
    );
    mocks.extractDocument
      .mockResolvedValueOnce(artifact('unpdf', ''))
      .mockResolvedValueOnce(artifact('mineru', ''));

    const response = await postPdf();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'NO_READABLE_PDF_TEXT',
    });
  });

  it('preserves the server cause when the selected parser itself fails', async () => {
    mocks.extractDocument.mockRejectedValueOnce(new Error('MinerU upstream unavailable'));

    const response = await postPdf('mineru');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'PARSE_FAILED',
      error: 'MinerU upstream unavailable',
    });
  });
});
