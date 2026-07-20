import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { decodeOfficeXml } from '@/lib/document/decode-office-xml';

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['txt', 'md']);
const OFFICE_EXTENSIONS = new Set(['pptx', 'docx']);

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

async function extractOfficeText(buffer: Buffer, extension: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const pattern =
    extension === 'pptx' ? /^ppt\/slides\/slide\d+\.xml$/ : /^word\/document\.xml$/;
  const entries = Object.values(zip.files)
    .filter((entry) => pattern.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const sections = await Promise.all(
    entries.map(async (entry) => decodeOfficeXml(await entry.async('text'))),
  );
  return sections.filter(Boolean).join('\n\n');
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return apiError('INVALID_REQUEST', 400, 'Expected multipart/form-data');
  }

  const formData = await req.formData();
  const file = formData.get('document') as File | null;
  if (!file) return apiError('MISSING_REQUIRED_FIELD', 400, 'No document provided');
  if (file.size > MAX_DOCUMENT_BYTES) {
    return apiError('INVALID_REQUEST', 413, 'Document exceeds 50 MB');
  }

  const extension = extensionOf(file.name);
  if (!TEXT_EXTENSIONS.has(extension) && !OFFICE_EXTENSIONS.has(extension)) {
    return apiError('INVALID_REQUEST', 415, 'Supported formats: PDF, PPTX, DOCX, TXT, MD');
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = TEXT_EXTENSIONS.has(extension)
      ? buffer.toString('utf8').trim()
      : await extractOfficeText(buffer, extension);
    if (!text) return apiError('PARSE_FAILED', 422, 'No readable text found in document');
    return apiSuccess({
      data: {
        text,
        images: [],
        metadata: { fileName: file.name, fileSize: file.size, pageCount: 0, parser: extension },
      },
    });
  } catch (error) {
    return apiError('PARSE_FAILED', 422, error instanceof Error ? error.message : 'Parse failed');
  }
}
