import { NextRequest } from 'next/server';
import type { PDFProviderId } from '@/lib/pdf/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  extractReadablePdf,
  InvalidPdfProviderUrlError,
  NoReadablePdfTextError,
} from '@/lib/server/pdf-document-extraction';
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

    const extracted = await extractReadablePdf({
      buffer: Buffer.from(await pdfFile.arrayBuffer()),
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      providerId: effectiveProviderId,
      apiKey: apiKey || undefined,
      baseUrl: baseUrl || undefined,
    });
    resolvedProviderId = extracted.providerId;
    return apiSuccess({ data: extracted.content });
  } catch (error) {
    log.error(
      `PDF parsing failed [provider=${resolvedProviderId ?? 'unknown'}, file="${pdfFileName ?? 'unknown'}"]:`,
      error,
    );
    if (error instanceof NoReadablePdfTextError) {
      return apiError(API_ERROR_CODES.NO_READABLE_PDF_TEXT, 422, error.message);
    }
    if (error instanceof InvalidPdfProviderUrlError) {
      return apiError('INVALID_URL', 403, error.message);
    }
    return apiError(
      API_ERROR_CODES.PARSE_FAILED,
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
