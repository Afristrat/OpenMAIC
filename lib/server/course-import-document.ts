import JSZip from 'jszip';
import type { PDFProviderId } from '@/lib/pdf/types';
import { decodeOfficeXml } from '@/lib/document/decode-office-xml';
import { extractReadablePdf } from '@/lib/server/pdf-document-extraction';
import type { PdfSourceContent } from '@/lib/types/generation';

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function docxHeadingPrefix(style: string): string {
  if (/^(title|titre|heading1|titre1)$/i.test(style)) return '# ';
  if (/^(heading2|titre2)$/i.test(style)) return '## ';
  if (/^(heading3|titre3)$/i.test(style)) return '### ';
  return '';
}

export async function extractStructuredDocx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) throw new Error('DOCX document.xml is missing');
  return [...documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
    .map(([paragraph]) => {
      const text = decodeOfficeXml(paragraph).trim();
      if (!text) return '';
      const style = paragraph.match(/<w:pStyle\s+w:val=["']([^"']+)["']\s*\/?\s*>/)?.[1] ?? '';
      return `${docxHeadingPrefix(style)}${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function extractCourseImportDocument(input: {
  buffer: Buffer;
  fileName: string;
  fileSize: number;
  mimeType: string;
  pdfProviderId?: PDFProviderId;
  pdfApiKey?: string;
  pdfBaseUrl?: string;
}): Promise<{ content: PdfSourceContent; parserId: string }> {
  const extension = extensionOf(input.fileName);
  if (extension === 'md') {
    return {
      content: { text: input.buffer.toString('utf8').trim(), images: [] },
      parserId: 'utf8',
    };
  }
  if (extension === 'docx') {
    return {
      content: { text: await extractStructuredDocx(input.buffer), images: [] },
      parserId: 'docx-structure-v1',
    };
  }
  if (extension === 'pdf') {
    const extracted = await extractReadablePdf({
      buffer: input.buffer,
      fileName: input.fileName,
      fileSize: input.fileSize,
      providerId: input.pdfProviderId ?? 'mineru',
      apiKey: input.pdfApiKey,
      baseUrl: input.pdfBaseUrl,
    });
    return {
      content: {
        name: input.fileName,
        text: extracted.content.text,
        images: extracted.content.metadata?.pdfImages ?? extracted.content.images,
      },
      parserId: extracted.providerId,
    };
  }
  throw new Error('Unsupported course import format');
}
