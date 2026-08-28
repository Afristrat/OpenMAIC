import {
  documentArtifactToParsedPdfContent,
  extractDocument,
} from '@/lib/document';
import { shouldUseOcrFallback } from '@/lib/document/pdf-text-quality';
import { createLogger } from '@/lib/logger';
import type { PDFProviderId } from '@/lib/pdf/types';
import {
  isServerConfiguredProvider,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
} from '@/lib/server/provider-config';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import type { ParsedPdfContent } from '@/lib/types/pdf';

const log = createLogger('PDF document extraction');

export class NoReadablePdfTextError extends Error {
  constructor() {
    super('No configured PDF parser returned readable text, including OCR fallback');
    this.name = 'NoReadablePdfTextError';
  }
}

export class InvalidPdfProviderUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPdfProviderUrlError';
  }
}

export async function extractReadablePdf(input: {
  buffer: Buffer;
  fileName: string;
  fileSize: number;
  providerId?: PDFProviderId;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ content: ParsedPdfContent; providerId: PDFProviderId }> {
  const providerId = input.providerId ?? 'unpdf';
  const managed = isServerConfiguredProvider('pdf', providerId);
  const clientBaseUrl = managed ? undefined : input.baseUrl;
  if (clientBaseUrl && process.env.NODE_ENV === 'production') {
    const ssrfError = await validateUrlForSSRF(clientBaseUrl);
    if (ssrfError) throw new InvalidPdfProviderUrlError(ssrfError);
  }
  const config = {
    providerId,
    apiKey: resolvePDFApiKey(providerId, managed ? undefined : input.apiKey),
    baseUrl: resolvePDFBaseUrl(providerId, clientBaseUrl),
  };
  const extract = async (parserConfig: typeof config) =>
    documentArtifactToParsedPdfContent(
      await extractDocument({
        buffer: input.buffer,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: 'application/pdf',
        config: parserConfig,
      }),
    );

  let content: ParsedPdfContent | undefined;
  let resolvedProviderId = providerId;
  let primaryError: unknown;
  try {
    content = await extract(config);
  } catch (error) {
    primaryError = error;
    if (providerId !== 'unpdf') throw error;
  }

  if (providerId === 'unpdf' && (!content || shouldUseOcrFallback(content.text))) {
    for (const ocrProviderId of ['mineru', 'mineru-cloud'] as const) {
      if (!isServerConfiguredProvider('pdf', ocrProviderId)) continue;
      try {
        const ocrContent = await extract({
          providerId: ocrProviderId,
          apiKey: resolvePDFApiKey(ocrProviderId),
          baseUrl: resolvePDFBaseUrl(ocrProviderId),
        });
        if (!shouldUseOcrFallback(ocrContent.text)) {
          content = ocrContent;
          resolvedProviderId = ocrProviderId;
          break;
        }
      } catch (error) {
        log.warn(`OCR fallback failed [provider=${ocrProviderId}, file="${input.fileName}"]`, error);
      }
    }
  }

  if (!content) throw primaryError ?? new Error('No PDF parser returned usable content');
  if (shouldUseOcrFallback(content.text)) throw new NoReadablePdfTextError();
  return {
    content: {
      ...content,
      metadata: {
        ...content.metadata,
        pageCount: content.metadata?.pageCount ?? 0,
        fileName: input.fileName,
        fileSize: input.fileSize,
      },
    },
    providerId: resolvedProviderId,
  };
}
