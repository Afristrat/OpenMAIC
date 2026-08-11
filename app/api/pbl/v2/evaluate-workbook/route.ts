import { NextResponse } from 'next/server';

import { evaluateWorkbookWithPython } from '@/lib/server/workbook-python';

export const runtime = 'nodejs';

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function POST(request: Request) {
  const formData = await request.formData();
  const workbook = formData.get('workbook');
  if (!(workbook instanceof File)) {
    return NextResponse.json({ error: 'workbook_required' }, { status: 400 });
  }
  if (!workbook.name.toLowerCase().endsWith('.xlsx') || workbook.size > MAX_WORKBOOK_BYTES) {
    return NextResponse.json({ error: 'invalid_workbook' }, { status: 400 });
  }
  if (
    workbook.type &&
    workbook.type !== XLSX_MIME &&
    workbook.type !== 'application/octet-stream'
  ) {
    return NextResponse.json({ error: 'invalid_workbook_type' }, { status: 415 });
  }
  try {
    const assessment = await evaluateWorkbookWithPython(Buffer.from(await workbook.arrayBuffer()));
    return NextResponse.json({ assessment });
  } catch (error) {
    console.error(
      '[workbook-assessment] Python evaluation failed',
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: 'workbook_evaluation_failed' }, { status: 422 });
  }
}
