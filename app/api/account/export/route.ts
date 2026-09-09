import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api/auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const sections = [
  'profiles',
  'org_members',
  'stages',
  'scenes',
  'quiz_results',
  'review_cards',
  'certificates',
  'payments',
  'usage_records',
  'telemetry_consent',
  'pedagogy_telemetry',
] as const;
const pageSchema = z
  .array(
    z
      .object({
        cursor: z.string().min(1),
        value: z.record(z.string(), z.unknown()),
      })
      .strict(),
  )
  .max(100);

/** Personal JSON export of the explicitly listed sections; not a database backup. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth.response) return auth.response;
  const user = auth.user;
  const cancelled = new AbortController();
  try {
    const service = createServiceSupabaseClient();
    const read = async (section: string, cursor: string | null) => {
      const result = await service
        .rpc('read_account_export_page', {
          p_actor: user.id,
          p_section: section,
          p_after: cursor,
        })
        .abortSignal(
          AbortSignal.any([request.signal, cancelled.signal, AbortSignal.timeout(5000)]),
        );
      if (result.error) throw new Error('Account export unavailable');
      const page = pageSchema.parse(result.data);
      let previous = cursor;
      for (const row of page) {
        if (previous !== null && row.cursor <= previous) throw new Error('Invalid export cursor');
        previous = row.cursor;
      }
      return page;
    };
    // Detect an unavailable schema/backend before sending successful response headers.
    const firstPage = await read(sections[0], null);
    async function* chunks(): AsyncGenerator<string> {
      const metadata = {
        exportedAt: new Date().toISOString(),
        userId: user.id,
        email: user.email,
        includedSections: sections,
      };
      yield JSON.stringify(metadata).slice(0, -1);
      for (const section of sections) {
        yield `,${JSON.stringify(section)}:[`;
        let cursor: string | null = null;
        let first = true;
        let page = section === sections[0] ? firstPage : await read(section, cursor);
        while (true) {
          for (const row of page) {
            yield (first ? '' : ',') + JSON.stringify(row.value);
            first = false;
          }
          if (page.length < 100) break;
          cursor = page[page.length - 1].cursor;
          page = await read(section, cursor);
        }
        yield ']';
      }
      yield `,"complete":true,"completedAt":${JSON.stringify(new Date().toISOString())}}`;
    }
    const iterator = chunks();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await iterator.next();
          if (chunk.done) controller.close();
          else controller.enqueue(encoder.encode(chunk.value));
        } catch {
          cancelled.abort();
          controller.error(new Error('Account export interrupted'));
        }
      },
      async cancel() {
        cancelled.abort();
        await iterator.return(undefined);
      },
    });
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="qalem-data-export-${auth.user.id.slice(0, 8)}-${Date.now()}.json"`,
      },
    });
  } catch {
    cancelled.abort();
    return NextResponse.json(
      { error: 'Account export unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
