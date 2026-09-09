import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminOrOrgAuthor } from '@/lib/api/auth';
import {
  DiwanError,
  diwanCommand,
  diwanListQuery,
  executeDiwanCommand,
  ingestDiwanSources,
  listDiwanSources,
  readDiwanBytes,
} from '@/lib/diwan/client';

type Context = { params: Promise<{ organizationId: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
// ponytail: one buffered import (50 MiB) per process; use streaming when concurrent imports are required.
let importing = false;
const failure = (status: number, code: string) =>
  NextResponse.json({ success: false, errorCode: code }, { status, headers });

async function authorize(req: NextRequest, context: Context) {
  const { organizationId } = await context.params;
  if (!z.uuid().safeParse(organizationId).success)
    return { response: failure(400, 'INVALID_ORGANIZATION') };
  const auth = await requireSuperAdminOrOrgAuthor(req, organizationId, { requireMembership: true });
  if (auth.response) return { response: auth.response };
  return { organizationId };
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await authorize(req, context);
  if (auth.response) return auth.response;
  try {
    const entries = [...req.nextUrl.searchParams];
    if (new Set(entries.map(([key]) => key)).size !== entries.length)
      return failure(400, 'INVALID_REQUEST');
    const query = diwanListQuery.safeParse(Object.fromEntries(entries));
    if (!query.success) return failure(400, 'INVALID_REQUEST');
    return NextResponse.json(await listDiwanSources(auth.organizationId, query.data), { headers });
  } catch (error) {
    return failure(
      error instanceof DiwanError ? error.status : 502,
      error instanceof DiwanError ? error.code : 'DIWAN_UNAVAILABLE',
    );
  }
}

export async function POST(req: NextRequest, context: Context) {
  const auth = await authorize(req, context);
  if (auth.response) return auth.response;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !URL.canParse(appUrl) || req.headers.get('origin') !== new URL(appUrl).origin)
    return failure(403, 'INVALID_ORIGIN');
  const contentType = req.headers.get('content-type') || '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const multipart = mime === 'multipart/form-data';
  if (!multipart && mime !== 'application/json') return failure(415, 'INVALID_CONTENT_TYPE');
  if (multipart && importing) return failure(503, 'DIWAN_IMPORT_BUSY');
  if (multipart) importing = true;
  const signal = AbortSignal.timeout(15000);
  try {
    const bytes = await readDiwanBytes(req.body, multipart ? 51 * 1024 * 1024 : 65536, signal);
    if (multipart) {
      const form = await new Response(Buffer.from(bytes), {
        headers: { 'Content-Type': contentType },
      }).formData();
      return NextResponse.json(await ingestDiwanSources(auth.organizationId, form), {
        status: 202,
        headers,
      });
    }
    const parsed = diwanCommand.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    if (!parsed.success) return failure(400, 'INVALID_REQUEST');
    return NextResponse.json(await executeDiwanCommand(auth.organizationId, parsed.data), {
      headers,
    });
  } catch (error) {
    if (signal.aborted) return failure(408, 'REQUEST_TIMEOUT');
    if (error instanceof DiwanError) return failure(error.status, error.code);
    return failure(400, 'INVALID_REQUEST');
  } finally {
    if (multipart) importing = false;
  }
}
