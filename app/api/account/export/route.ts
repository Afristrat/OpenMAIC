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
  'user_profiles',
  'agent_reviews',
  'castings',
  'live_sessions',
  'session_events',
  'evaluations',
  'anchor_plans',
  'anchor_deliveries',
  'seeds',
  'seed_generation_runs',
  'classroom_intervention_decisions',
  'review_notification_preferences',
  'review_notification_deliveries',
  'push_subscriptions',
  'web_push_deliveries',
  'lti_user_bindings',
  'lti_launch_sessions',
  'lti_quiz_attempts',
  'lti_grade_outbox',
  'lti_grade_submissions',
  'transmissions',
  'courses',
  'course_imports',
  'agent_configs',
  'organization_sources',
  'formation_source_manifests',
  'shared_classrooms',
  'export_jobs',
  'video_generation_jobs',
  'video_capsules',
  'classroom_generation_jobs',
  'tenant_usage_reservations',
  'tenant_credit_ledger',
  'tenant_admin_audit',
  'xapi_outbox',
  'classroom_templates',
  'curriculum_links',
  'org_invitations',
  'organization_skills',
  'widget_templates',
  'widget_template_versions',
  'widget_template_publications',
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
    // This deadline belongs only to Auth, not to the entire paginated download.
    const identityService = createServiceSupabaseClient(
      AbortSignal.any([request.signal, cancelled.signal, AbortSignal.timeout(5000)]),
    );
    const [firstPage, identityResult] = await Promise.all([
      read(sections[0], null),
      identityService.auth.admin.getUserById(user.id),
    ]);
    const identity = identityResult.data?.user;
    if (identityResult.error || !identity || identity.id !== user.id) {
      throw new Error('Account export unavailable');
    }
    // Never serialize the Auth response: metadata, MFA and future fields stay private.
    const accountIdentity = {
      id: identity.id,
      email: identity.email ?? null,
      phone: identity.phone ?? null,
      createdAt: identity.created_at,
      updatedAt: identity.updated_at ?? null,
      lastSignInAt: identity.last_sign_in_at ?? null,
      emailConfirmedAt: identity.email_confirmed_at ?? null,
      phoneConfirmedAt: identity.phone_confirmed_at ?? null,
      providers: [...new Set((identity.identities ?? []).map((entry) => entry.provider))],
    };
    async function* chunks(): AsyncGenerator<string> {
      const metadata = {
        formatVersion: 2,
        bigintEncoding: 'decimal-string',
        scope: 'listed-personal-sections',
        excludedCategories: [
          'authentication-credentials',
          'delivery-secrets',
          'organization-configuration',
          'unlinked-discussion-history',
          'storage-file-binaries',
        ],
        exportedAt: new Date().toISOString(),
        userId: user.id,
        email: user.email,
        accountIdentity,
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
            const value =
              section === 'course_imports'
                ? {
                    ...row.value,
                    downloadUrl: `/api/account/export/imports/${z.string().uuid().parse(row.value.id)}`,
                  }
                : section === 'session_events' && typeof row.value.audio_path === 'string'
                  ? {
                      ...row.value,
                      downloadUrl: `/api/live-sessions/${z.string().uuid().parse(row.value.session_id)}/audio?path=${encodeURIComponent(row.value.audio_path)}&download=1`,
                    }
                  : row.value;
            yield (first ? '' : ',') + JSON.stringify(value);
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
