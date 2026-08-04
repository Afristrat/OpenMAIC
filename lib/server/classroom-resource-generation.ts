import JSZip from 'jszip';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type {
  GeneratedLearningResource,
  ResourceGenerationRequest,
  SceneOutline,
} from '@/lib/types/generation';
import { uploadClassroomMedia } from '@/lib/server/classroom-media-generation';

type CellValue = string | number | boolean | null;

interface WorkbookSpec {
  sheets: Array<{ name: string; rows: CellValue[][] }>;
}

const MAX_SHEETS = 5;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;
const MAX_CELL_LENGTH = 20_000;

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeFileName(value: string): string {
  const stem = value
    .replace(/\.xlsx$/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${stem || 'ressource'}.xlsx`;
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

async function generateWorkbookSpec(
  request: ResourceGenerationRequest,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<WorkbookSpec> {
  const system = `You generate a complete, immediately usable learning workbook as strict JSON. Return {"sheets":[{"name":"...","rows":[[...]]}]}. Use only string, finite number, boolean, or null cell values. Include clear headers, all data needed for the exercise, and useful formulas as literal Excel formulas beginning with = only when the request requires them. Maximum ${MAX_SHEETS} sheets, ${MAX_ROWS} rows per sheet, and ${MAX_COLUMNS} columns. Do not return markdown or commentary.`;
  const user = `Language directive: ${languageDirective}\nResource title: ${request.title}\nCreate the workbook requested between the markers.\n<<<RESOURCE_REQUEST\n${request.prompt}\nRESOURCE_REQUEST>>>`;
  const parsed = parseJsonResponse<WorkbookSpec>(await aiCall(system, user));
  if (!parsed) throw new Error(`Resource generation returned invalid JSON for ${request.id}`);
  return normalizeWorkbook(parsed);
}

async function fetchQrPng(url: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(url)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`QR generation failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 500) throw new Error('QR generation returned an invalid image');
  return bytes;
}

export async function generateResourcesForClassroom(
  outlines: SceneOutline[],
  classroomId: string,
  baseUrl: string,
  languageDirective: string,
  aiCall: AICallFn,
): Promise<number> {
  const origin = new URL(baseUrl).origin;
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
      if (request.format !== 'xlsx') throw new Error(`Unsupported resource format: ${request.format}`);
      if (!/^[a-zA-Z0-9_-]+$/.test(request.id)) throw new Error(`Invalid resource id: ${request.id}`);
      if (seenIds.has(request.id)) throw new Error(`Duplicate resource id: ${request.id}`);
      seenIds.add(request.id);
      const fileName = safeFileName(request.fileName);
      const downloadUrl = `/r/${classroomId}/${request.id}/${encodeURIComponent(fileName)}`;
      const workbook = await buildXlsx(await generateWorkbookSpec(request, languageDirective, aiCall));
      const qr = await fetchQrPng(`${origin}${downloadUrl}`);
      await uploadClassroomMedia(classroomId, `resources/${request.id}.xlsx`, workbook);
      await uploadClassroomMedia(classroomId, `resources/${request.id}-qr.png`, qr);
      resources.push({
        id: request.id,
        format: 'xlsx',
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
