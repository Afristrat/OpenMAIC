// Explicit integration recipe: real application helpers, HTTP/PostgREST and SQL.
// Only the isolated, synthetic S048 database is accepted. No production credentials.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { z } from 'zod';
import { runWithUsageMeteringContext } from '@/lib/billing/usage-context';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { collectDiscussionData } from '@/lib/telemetry/discussion-collector';
import { submitClassroomQuiz } from '@/lib/quiz/classroom-submission';
import { getBestPatterns } from '@/lib/orchestration/data-driven-director';
import { observeDirectorChoice } from '@/lib/orchestration/observed-director';
import {
  beginDirectorReceipt,
  selectDirectorReceipt,
  finishDirectorReceipt,
} from '@/lib/orchestration/director-receipts';
import { buildDirectorExperimentReport } from '@/lib/orchestration/director-experiment-report';

async function main() {
  assert(process.argv.includes('--isolated-s048'), 'Explicit isolated recipe flag required');
  const rest = 'http://qalem-prd3-rest-20260910:3000';
  assert.equal(process.env.S048_REST_URL, rest, 'Only the isolated Docker endpoint is allowed');
  const secret = process.env.S048_JWT_SECRET;
  assert(secret && secret.length >= 32, 'Ephemeral JWT secret required');
  function token(role: string) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 900 }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    return `${body}.${createHmac('sha256', secret!).update(body).digest('base64url')}`;
  }

  // Supabase's gateway normally strips /rest/v1. This local gateway forwards
  // bytes and headers only; no route, database response or helper is simulated.
  const gateway = createServer((incoming, outgoing) => {
    if (!incoming.url?.startsWith('/rest/v1/')) {
      outgoing.writeHead(404).end();
      return;
    }
    const upstream = request(
      {
        hostname: new URL(rest).hostname,
        port: 3000,
        path: incoming.url.slice('/rest/v1'.length),
        method: incoming.method,
        headers: incoming.headers,
        timeout: 5000,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const address = gateway.address();
  assert(address && typeof address !== 'string');
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = token('service_role');
  process.env.QALEM_DATA_DIRECTOR_ENABLED = 'true';

  const actor = '00000000-0048-4000-8000-000000000031';
  const org = '00000000-0048-4000-8000-000000000032';
  const stage = 's048-receipt-proof';
  const scene = 's048-receipt-scene';
  const db = createServiceSupabaseClient(AbortSignal.timeout(60000));
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await db.rpc(name, args);
    assert(!error, `${name}: ${error?.code ?? 'unavailable'}`);
    return data;
  }
  const inScope = <T>(callback: () => T) =>
    runWithUsageMeteringContext(new Headers(), actor, org, callback);
  const scope = { actorId: actor, orgId: org, stageIds: [stage] };
  try {
    const { data: consent, error } = await db
      .from('telemetry_consent')
      .select('collection_epoch,pedagogy_consent')
      .eq('user_id', actor)
      .single();
    assert(!error);
    const epoch = z
      .object({ collection_epoch: z.uuid(), pedagogy_consent: z.literal(true) })
      .parse(consent).collection_epoch;
    assert.deepEqual(await getBestPatterns('SIPOC', 'fr-FR', scope), []);
    const empty = await inScope(() => observeDirectorChoice(stage, [], ['a']));
    assert.equal(empty?.reason, 'no-compatible-pattern');
    assert.equal(empty?.cohort, 'data-driven');

    const receipt = await inScope(() => beginDirectorReceipt(stage, scene, 'a'));
    assert(receipt, 'Real receipt RPC must acknowledge its UUID');
    await inScope(() => selectDirectorReceipt(receipt, 'a', empty, 12));
    await inScope(() => finishDirectorReceipt(receipt, 'completed'));
    const observation = {
      discussionId: randomUUID(),
      sceneId: scene,
      durationBasis: 'client-monotonic-elapsed' as const,
      classificationMethod: 'text-heuristic-v1' as const,
      turns: [
        {
          id: `assistant-${receipt}`,
          agentId: 'a',
          interventionType: 'question' as const,
          durationMs: 300,
          outcome: 'completed' as const,
        },
      ],
      postDiscussionQuiz: null,
    };
    assert.equal(
      await collectDiscussionData(actor, {
        stageId: stage,
        orgId: org,
        consentEpoch: epoch,
        observation,
      }),
      true,
    );
    const submission = {
      requestId: randomUUID(),
      orgId: org,
      stageId: stage,
      sceneId: 's048-receipt-quiz',
      answers: {},
    };
    const quiz = await submitClassroomQuiz(actor, submission);
    assert.equal(quiz.status, 'completed');
    assert('result' in quiz);
    assert.equal(quiz.result.score, 0, 'The real persisted-content grader must retain zero');
    assert.deepEqual(await submitClassroomQuiz(actor, submission), quiz, 'Retry changes receipt');
    const patterns = await getBestPatterns('SIPOC', 'fr-FR', scope);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].sampleSize, 1);
    assert.equal(patterns[0].avgQuizScore, 0);
    const selected = await inScope(() => observeDirectorChoice(stage, [], ['a']));
    assert.equal(selected?.reason, 'observed-pattern');
    assert.equal(selected?.suggestion?.agentId, 'a');
    assert.equal(selected?.suggestion?.observedMeanQuizScore, 0);
    assert.equal(
      (await inScope(() => observeDirectorChoice(stage, [], ['unavailable-agent'])))?.reason,
      'no-compatible-pattern',
    );
    const classic = await runWithUsageMeteringContext(new Headers(), org, org, () =>
      observeDirectorChoice(stage, [], ['a']),
    );
    assert.equal(classic?.reason, 'control');
    assert.equal(classic?.suggestion, null);

    const reportArgs = { p_actor: actor, p_org: org, p_stage: stage };
    const report = buildDirectorExperimentReport(await rpc('read_director_experiment', reportArgs));
    assert.equal(report.cohorts.length, 1);
    assert.equal(report.cohorts[0].linkedTurns, 1);
    assert.equal(report.cohorts[0].assignedUnits, 1);
    assert.equal(report.cohorts[0].unitsWithQuiz, 1);
    assert.equal(report.cohorts[0].meanQuizScore, 0);
    assert.equal(report.comparisons[0].meanScoreDifference, null);
    const forbidden = await fetch(`${rest}/rpc/read_director_experiment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token('authenticated')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reportArgs),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(forbidden.status, 403, 'Authenticated clients must not spoof the service actor');
    const revoked = await db
      .from('telemetry_consent')
      .update({ pedagogy_consent: false })
      .eq('user_id', actor);
    assert(!revoked.error);
    assert.deepEqual(await getBestPatterns('SIPOC', 'fr-FR', scope), []);
    assert.deepEqual(await rpc('read_director_experiment', reportArgs), []);
    assert.equal(await inScope(() => beginDirectorReceipt(stage, scene, 'a')), null);
    console.log(
      'S048 real HTTP/SQL: zero/one observation, zero score, receipt/quiz/report, cohorts, rights and withdrawal passed',
    );
  } finally {
    gateway.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      gateway.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

main().catch((error: unknown) => {
  // No request headers, JWTs or database URLs in the transcript.
  console.error(error instanceof Error ? error.message : 'S048 isolated recipe failed');
  process.exitCode = 1;
});
