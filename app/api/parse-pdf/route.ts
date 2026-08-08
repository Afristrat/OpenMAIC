import { NextRequest } from 'next/server';
import {
  isServerConfiguredProvider,
  resolvePDFApiKey,
  resolvePDFBaseUrl,
} from '@/lib/server/provider-config';
import type { PDFProviderId } from '@/lib/pdf/types';
import type { ParsedPdfContent } from '@/lib/types/pdf';
import { documentArtifactToParsedPdfContent, extractDocument } from '@/lib/document';
import { shouldUseOcrFallback } from '@/lib/document/pdf-text-quality';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Parse PDF');

export async function POST(req: NextRequest) {
  let pdfFileName: string | undefined;
  let resolvedProviderId: string | undefined;
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      log.error('Invalid Content-Type for PDF upload:', contentType);
      return apiError(
        'INVALID_REQUEST',
        400,
        `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const providerId = formData.get('providerId') as PDFProviderId | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!pdfFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'No PDF file provided');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('unpdf' as PDFProviderId);
    pdfFileName = pdfFile?.name;
    resolvedProviderId = effectiveProviderId;

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('pdf', effectiveProviderId);
    const clientBaseUrl = managed ? undefined : baseUrl || undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      apiKey: resolvePDFApiKey(effectiveProviderId, managed ? undefined : apiKey || undefined),
      baseUrl: resolvePDFBaseUrl(effectiveProviderId, clientBaseUrl),
    };

    // Convert PDF to buffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extract = async (parserConfig: typeof config) =>
      documentArtifactToParsedPdfContent(
        await extractDocument({
          buffer,
          fileName: pdfFile.name,
          fileSize: pdfFile.size,
          mimeType: 'application/pdf',
          config: parserConfig,
        }),
      );

    let result: ParsedPdfContent | undefined;
    let primaryError: unknown;
    try {
      result = await extract(config);
    } catch (error) {
      primaryError = error;
      if (effectiveProviderId !== 'unpdf') throw error;
    }

    if (effectiveProviderId === 'unpdf' && (!result || shouldUseOcrFallback(result.text))) {
      for (const ocrProviderId of ['mineru', 'mineru-cloud'] as const) {
        if (!isServerConfiguredProvider('pdf', ocrProviderId)) continue;
        try {
          const ocrResult = await extract({
            providerId: ocrProviderId,
            apiKey: resolvePDFApiKey(ocrProviderId),
            baseUrl: resolvePDFBaseUrl(ocrProviderId),
          });
          if (!shouldUseOcrFallback(ocrResult.text)) {
            result = ocrResult;
            resolvedProviderId = ocrProviderId;
            break;
          }
        } catch (ocrError) {
          log.warn(
            `OCR fallback failed [provider=${ocrProviderId}, file="${pdfFile.name}"]`,
            ocrError,
          );
        }
      }
    }

    if (!result) throw primaryError ?? new Error('No PDF parser returned usable content');
    if (shouldUseOcrFallback(result.text)) {
      throw new Error('No configured PDF parser returned readable text, including OCR fallback');
    }

    // Add file metadata
    const resultWithMetadata: ParsedPdfContent = {
      ...result,
      metadata: {
        ...result.metadata,
        pageCount: result.metadata?.pageCount ?? 0, // Ensure pageCount is always a number
        fileName: pdfFile.name,
        fileSize: pdfFile.size,
      },
    };

    return apiSuccess({ data: resultWithMetadata });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    return apiError('PARSE_FAILED', 500, error instanceof Error ? error.message : 'Unknown error');
  }
}
