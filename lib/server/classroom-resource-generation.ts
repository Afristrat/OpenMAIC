import JSZip from 'jszip';
import { Byte, Encoder } from '@nuintun/qrcode';
import { customAlphabet } from 'nanoid';
import sharp from 'sharp';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type {
  GeneratedLearningResource,
  ResourceGenerationRequest,
  SceneOutline,
} from '@/lib/types/generation';
import { uploadClassroomMedia } from '@/lib/server/classroom-media-generation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

type CellValue = string | number | boolean | null;

interface WorkbookSpec {
  sheets: Array<{ name: string; rows: CellValue[][] }>;
}

export interface DocumentSpec {
  title: string;
  sections: Array<{ heading: string; paragraphs: string[]; bulletPoints?: string[] }>;
}

const MAX_SHEETS = 5;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 20_000;
const MAX_WORKBOOK_GENERATION_ATTEMPTS = 2;
const SHORT_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const randomShortCode = customAlphabet(SHORT_CODE_ALPHABET, 5);
const MAX_SHORT_CODE_ATTEMPTS = 20;

interface ResourceShortLink {
  classroomId: string;
  resourceId: string;
  fileName: string;
}

export function createResourceShortCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = randomShortCode();
    if (/[0-9]/.test(code) && /[A-Z]/.test(code) && /[a-z]/.test(code)) return code;
  }
  throw new Error('Unable to generate a mixed alphanumeric short code');
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeFileName(value: string, format: ResourceGenerationRequest['format']): string {
  const stem = value
    .replace(/\.(?:xlsx|docx)$/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${stem || 'ressource'}.${format}`;
}

function normalizeWorkbook(input: WorkbookSpec): WorkbookSpec {
  if (!input || !Array.isArray(input.sheets) || input.sheets.length === 0) {
    throw new Error('Resource generation returned no worksheet');
  }
  return {
    sheets: input.sheets.slice(0, MAX_SHEETS).map((sheet, sheetIndex) => {
      if (!Array.isArray(sheet.rows) || sheet.rows.length === 0) {
        throw new Error(`Worksheet ${sheetIndex + 1} has no rows`);
      }
      return {
        name: String(sheet.name || `Feuille ${sheetIndex + 1}`).slice(0, 31),
        rows: sheet.rows.slice(0, MAX_ROWS).map((row) =>
          (Array.isArray(row) ? row : []).slice(0, MAX_COLUMNS).map((cell) => {
            if (cell === null || typeof cell === 'number' || typeof cell === 'boolean') return cell;
            return String(cell).slice(0, MAX_CELL_LENGTH);
          }),
        ),
      };
    }),
  };
}

function columnName(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(rows: CellValue[][]): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (cell === null) return `<c r="${ref}"/>`;
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          if (typeof cell === 'boolean') {
            return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
          }
          if (typeof cell === 'string' && cell.startsWith('=') && cell.length > 1) {
            return `<c r="${ref}"><f>${xml(cell.slice(1))}</f></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(cell))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export async function buildXlsx(spec: WorkbookSpec): Promise<Buffer> {
  const workbook = normalizeWorkbook(spec);
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${workbook.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbook.sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbook.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`,
  );
  workbook.sheets.forEach((sheet, index) => {
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet.rows));
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function wordParagraph(text: string, style?: 'Title' | 'Heading1'): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

export async function buildDocx(spec: DocumentSpec): Promise<Buffer> {
  if (!spec.title?.trim() || !Array.isArray(spec.sections) || spec.sections.length === 0) {
    throw new Error('Document generation returned no usable content');
  }
  const sections = spec.sections.slice(0, 30);
  const body = [
    wordParagraph(spec.title.trim().slice(0, 500), 'Title'),
    ...sections.flatMap((section) => [
      wordParagraph(
        String(section.heading || '')
          .trim()
          .slice(0, 500),
        'Heading1',
      ),
      ...(Array.isArray(section.paragraphs) ? section.paragraphs : [])
        .slice(0, 100)
        .map((paragraph) => wordParagraph(String(paragraph).slice(0, MAX_CELL_LENGTH))),
      ...(Array.isArray(section.bulletPoints) ? section.bulletPoints : [])
        .slice(0, 100)
        .map((item) => wordParagraph(`• ${String(item).slice(0, MAX_CELL_LENGTH)}`)),
    ]),
  ].join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function generateWorkbookSpec(
  request: ResourceGenerationRequest,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<WorkbookSpec> {
  const system = `You generate a complete, immediately usable learning workbook as strict JSON. Return {"sheets":[{"name":"...","rows":[[...]]}]}. Use only string, finite number, boolean, or null cell values. Include clear headers, all data needed for the exercise, and useful formulas as literal Excel formulas beginning with = only when the request requires them. Maximum ${MAX_SHEETS} sheets, ${MAX_ROWS} rows per sheet, and ${MAX_COLUMNS} columns. Do not return markdown or commentary.`;
  const user = `Language directive: ${languageDirective}\nResource title: ${request.title}\nCreate the workbook requested between the markers.\n<<<RESOURCE_REQUEST\n${request.prompt}\nRESOURCE_REQUEST>>>`;
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_WORKBOOK_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const retryDirective =
        attempt === 1
          ? ''
          : '\nYour previous response was structurally invalid. Return at least one non-empty worksheet using exactly the required JSON shape.';
      const parsed = parseJsonResponse<WorkbookSpec>(
        await aiCall(system, `${user}${retryDirective}`),
      );
      if (!parsed) throw new Error(`Resource generation returned invalid JSON for ${request.id}`);
      return normalizeWorkbook(parsed);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error(`Resource generation failed for ${request.id}`);
}

async function generateDocumentSpec(
  request: ResourceGenerationRequest,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<DocumentSpec> {
  const system = `You generate a complete, editable learning document as strict JSON. Return {"title":"...","sections":[{"heading":"...","paragraphs":["..."],"bulletPoints":["..."]}]}. Include all instructions, templates, examples and learner work areas needed to use the resource immediately. Maximum 30 sections and 100 paragraphs or bullet points per section. Do not return markdown or commentary.`;
  const user = `Language directive: ${languageDirective}\nResource title: ${request.title}\nCreate the document requested between the markers.\n<<<RESOURCE_REQUEST\n${request.prompt}\nRESOURCE_REQUEST>>>`;
  const parsed = parseJsonResponse<DocumentSpec>(await aiCall(system, user));
  if (!parsed?.title || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error(`Document generation returned invalid JSON for ${request.id}`);
  }
  return parsed;
}

export async function generateQrPng(url: string): Promise<Buffer> {
  const qr = new Encoder({ level: 'M' }).encode(new Byte(url));
  const imageSize = 320;
  const quietZoneModules = 4;
  const moduleSize = Math.floor(imageSize / (qr.size + quietZoneModules * 2));
  if (moduleSize < 1) throw new Error('QR content is too large to render');

  const qrPixelSize = qr.size * moduleSize;
  const offset = Math.floor((imageSize - qrPixelSize) / 2);
  const modules: string[] = [];
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.get(x, y) === 1) {
        modules.push(
          `<rect x="${offset + x * moduleSize}" y="${offset + y * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`,
        );
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize}" viewBox="0 0 ${imageSize} ${imageSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${modules.join('')}</g></svg>`;
  return sharp(Buffer.from(svg, 'utf8')).png({ compressionLevel: 9 }).toBuffer();
}

async function reserveShortLink(metadata: ResourceShortLink): Promise<string> {
  const bucket = createServiceSupabaseClient().storage.from('classroom-media');
  const body = Buffer.from(JSON.stringify(metadata), 'utf8');
  for (let attempt = 0; attempt < MAX_SHORT_CODE_ATTEMPTS; attempt += 1) {
    const code = createResourceShortCode();
    const { error } = await bucket.upload(`short-links/${code}.json`, body, {
      contentType: 'application/json',
      upsert: false,
    });
    if (!error) return code;
    if (error.message.toLowerCase().includes('already exists')) continue;
    throw new Error(`Short-link persistence failed: ${error.message}`);
  }
  throw new Error('Unable to reserve a unique five-character short link');
}

export async function generateResourcesForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  baseUrl: string,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<number> {
  const publicUrl = new URL(baseUrl);
  if (
    publicUrl.protocol === 'http:' &&
    publicUrl.hostname !== 'localhost' &&
    publicUrl.hostname !== '127.0.0.1'
  ) {
    publicUrl.protocol = 'https:';
  }
  const publicOrigin = publicUrl.origin;
  const seenIds = new Set<string>();
  const requestedCount = outlines.reduce(
    (count, outline) => count + (outline.resourceGenerations?.length ?? 0),
    0,
  );
  if (requestedCount > 2) throw new Error('A classroom can generate at most two resources');
  let generated = 0;
  for (const outline of outlines) {
    const resources: GeneratedLearningResource[] = [];
    for (const request of outline.resourceGenerations ?? []) {
      if (!/^[a-zA-Z0-9_-]+$/.test(request.id))
        throw new Error(`Invalid resource id: ${request.id}`);
      if (seenIds.has(request.id)) throw new Error(`Duplicate resource id: ${request.id}`);
      seenIds.add(request.id);
      const fileName = safeFileName(request.fileName, request.format);
      const resource =
        request.format === 'xlsx'
          ? await buildXlsx(await generateWorkbookSpec(request, languageDirective, aiCall))
          : await buildDocx(await generateDocumentSpec(request, languageDirective, aiCall));
      await uploadClassroomMedia(
        classroomId,
        `resources/${request.id}.${request.format}`,
        resource,
      );
      const shortCode = await reserveShortLink({
        classroomId,
        resourceId: request.id,
        fileName,
      });
      const downloadUrl = `${publicOrigin}/${shortCode}`;
      const qr = await generateQrPng(downloadUrl);
      await uploadClassroomMedia(classroomId, `resources/${request.id}-qr.png`, qr);
      resources.push({
        id: request.id,
        format: request.format,
        title: request.title,
        fileName,
        downloadUrl,
        qrImageUrl: `/api/classroom-media/${classroomId}/resources/${request.id}-qr.png`,
      });
      generated += 1;
    }
    outline.generatedResources = resources;
  }
  return generated;
}
