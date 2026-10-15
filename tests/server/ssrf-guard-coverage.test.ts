import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validate: vi.fn(), managed: vi.fn() }));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: mocks.validate }));
vi.mock('@/lib/server/provider-config', () => ({
  isServerConfiguredProvider: mocks.managed,
  resolveApiKey: (_id: string, clientKey: string) => clientKey || 'server-key',
  resolveBaseUrl: (_id: string, clientBaseUrl?: string) => clientBaseUrl,
  resolveProxy: () => undefined,
}));
vi.mock('@/lib/ai/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/providers')>()),
  getModel: (args: Record<string, unknown>) => ({
    model: { id: args.modelId },
    modelInfo: undefined,
  }),
}));

const BLOCK = 'Local/private network URLs are not allowed';

describe('la garde SSRF ne dépend jamais de NODE_ENV', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.validate.mockReset();
    mocks.managed.mockReset();
    mocks.managed.mockReturnValue(false);
    delete process.env.MODEL_ROUTES;
  });

  it('resolveModel refuse une baseUrl cliente privée hors production (NODE_ENV=test)', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    mocks.validate.mockResolvedValue(BLOCK);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    await expect(
      resolveModel({ modelString: 'openai:gpt-5.4-mini', baseUrl: 'http://169.254.169.254/v1' }),
    ).rejects.toThrow(BLOCK);
    expect(mocks.validate).toHaveBeenCalledWith('http://169.254.169.254/v1');
  });

  it("resolveModel ne contrôle pas la baseUrl d'un fournisseur géré côté serveur", async () => {
    mocks.managed.mockReturnValue(true);
    const { resolveModel } = await import('@/lib/server/resolve-model');
    await resolveModel({
      modelString: 'openai:gpt-5.4-mini',
      baseUrl: 'http://ollama.internal:11434',
    });
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it('extractReadablePdf refuse une baseUrl cliente privée hors production', async () => {
    mocks.validate.mockResolvedValue(BLOCK);
    const { extractReadablePdf, InvalidPdfProviderUrlError } =
      await import('@/lib/server/pdf-document-extraction');
    await expect(
      extractReadablePdf({
        buffer: Buffer.from('x'),
        fileName: 'a.pdf',
        fileSize: 1,
        providerId: 'mineru',
        baseUrl: 'http://10.0.0.5:8000',
      }),
    ).rejects.toBeInstanceOf(InvalidPdfProviderUrlError);
  });

  // Les routes ne se montent pas toutes sans leur environnement complet : garde-fou statique
  // contre le retour d'un `NODE_ENV === 'production'` autour d'un appel à la garde.
  it.each([
    'app/api/verify-video-provider/route.ts',
    'app/api/verify-image-provider/route.ts',
    'app/api/verify-pdf-provider/route.ts',
    'app/api/transcription/route.ts',
    'app/api/generate/image/route.ts',
    'app/api/generate/video/route.ts',
    'lib/server/resolve-model.ts',
    'lib/server/pdf-document-extraction.ts',
  ])("%s appelle la garde sans condition d'environnement", (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toContain('validateUrlForSSRF(');
    expect(source).not.toMatch(
      /NODE_ENV[^\n]*\n?[^\n]*validateUrlForSSRF|validateUrlForSSRF[^\n]*NODE_ENV/,
    );
    expect(source).not.toMatch(
      /&&\s*process\.env\.NODE_ENV\s*===\s*'production'\s*\)\s*\{\s*\n\s*const ssrfError/,
    );
  });
});
