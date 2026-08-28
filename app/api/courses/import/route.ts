import { type NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import { isFeatureEnabled } from '@/lib/flags';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import type { PDFProviderId } from '@/lib/pdf/types';
import { runCourseImportPipeline } from '@/lib/server/course-import-pipeline';
import {
  InvalidPdfProviderUrlError,
  NoReadablePdfTextError,
} from '@/lib/server/pdf-document-extraction';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['md', 'docx', 'pdf']);

export const maxDuration = 300;

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

async function authorize(request: NextRequest, orgId: FormDataEntryValue | string | null) {
  if (typeof orgId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orgId)) {
    return { response: NextResponse.json({ error: 'A valid orgId is required' }, { status: 400 }) };
  }
  return requireSuperAdminOrOrgAuthor(request, orgId);
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request, request.nextUrl.searchParams.get('orgId'));
  if (auth.response) return auth.response;
  return NextResponse.json({ enabled: await isFeatureEnabled('import_pipeline') });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const form = await request.formData();
  const auth = await authorize(request, form.get('orgId'));
  if (auth.response) return auth.response;
  if (!(await isFeatureEnabled('import_pipeline'))) {
    return NextResponse.json({ error: 'Course import is unavailable' }, { status: 404 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A course file is required' }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: 'Course imports must be between 1 byte and 25 MB' }, { status: 413 });
  }
  if (!SUPPORTED_EXTENSIONS.has(extensionOf(file.name))) {
    return NextResponse.json({ error: 'Supported formats: Markdown, DOCX and text PDF' }, { status: 415 });
  }
  if (form.get('rightsAttested') !== 'true') {
    return NextResponse.json({ error: 'Rights attestation is required' }, { status: 400 });
  }
  const providerValue = form.get('providerId');
  const providerId = typeof providerValue === 'string' ? providerValue : undefined;
  if (providerId && !(providerId in PDF_PROVIDERS)) {
    return NextResponse.json({ error: 'Unknown PDF provider' }, { status: 400 });
  }

  try {
    const result = await runCourseImportPipeline({
      ownerId: auth.user.id,
      orgId: form.get('orgId') as string,
      originalFilename: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      rightsAttested: true,
      pdfProviderId: providerId as PDFProviderId | undefined,
      pdfApiKey: typeof form.get('apiKey') === 'string' ? (form.get('apiKey') as string) : undefined,
      pdfBaseUrl:
        typeof form.get('baseUrl') === 'string' ? (form.get('baseUrl') as string) : undefined,
    });
    return NextResponse.json(result, { status: result.validation.status === 'conform' ? 201 : 422 });
  } catch (error) {
    if (error instanceof InvalidPdfProviderUrlError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof NoReadablePdfTextError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Course import failed' },
      { status: 500 },
    );
  }
}
