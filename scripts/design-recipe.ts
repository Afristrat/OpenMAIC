/**
 * Replayable design recipe: clones a small reference plan, generates the course through the
 * real worker queue, then audits every generated slide with the adaptive design linter.
 *
 *   tsx scripts/design-recipe.ts [templatePlanJobId] [baseUrl]
 *
 * Defaults: template `plan-Pastel01` (5 slides, no voice, no image), base URL `https://qalem.ma`.
 * Consumes tenant credits like any generation. Exit code 0 only when the audit reports no error.
 */
import { spawnSync } from 'node:child_process';
import { nanoid } from 'nanoid';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { enqueueClassroomGeneration, enqueueClassroomPlan } from '@/lib/jobs/queue';
import {
  createClassroomGenerationJob,
  readClassroomGenerationJob,
} from '@/lib/server/classroom-job-store';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';

async function main(): Promise<void> {
  const templateId = process.argv[2] ?? 'plan-Pastel01';
  const baseUrl = process.argv[3] ?? 'https://qalem.ma';
  const POLL_MS = 10_000;
  const TIMEOUT_MS = 20 * 60_000;
  const supabase = createServiceSupabaseClient();

  async function waitFor<T>(label: string, read: () => Promise<T | undefined>): Promise<T> {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const value = await read();
      if (value !== undefined) return value;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    throw new Error(`${label}: timeout after ${TIMEOUT_MS / 60_000} min`);
  }

  const { data: template, error: templateError } = await supabase
    .from('classroom_generation_jobs')
    .select('owner_id, org_id, payload')
    .eq('id', templateId)
    .maybeSingle();
  if (templateError || !template) {
    console.error(`Template plan ${templateId} not found: ${templateError?.message ?? 'no row'}`);
    process.exit(2);
  }

  const planId = `recipe-plan-${nanoid(6)}`;
  const templatePayload = template.payload as { input: GenerateClassroomInput };
  const { error: insertError } = await supabase.from('classroom_generation_jobs').insert({
    id: planId,
    owner_id: template.owner_id,
    org_id: template.org_id,
    status: 'queued',
    payload: {
      id: planId,
      kind: 'classroom-plan',
      status: 'queued',
      message: 'Design recipe plan',
      ownerId: template.owner_id,
      orgId: template.org_id,
      input: templatePayload.input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  if (insertError) {
    console.error(`Plan job not created: ${insertError.message}`);
    process.exit(2);
  }
  await enqueueClassroomPlan({ jobId: planId });
  console.log(`plan ${planId} queued`);

  const plan = await waitFor('plan', async () => {
    const { data } = await supabase
      .from('classroom_generation_jobs')
      .select('status, payload')
      .eq('id', planId)
      .single();
    if (data?.status === 'failed') throw new Error(`plan failed: ${JSON.stringify(data.payload)}`);
    return data?.status === 'succeeded'
      ? (data.payload as { result: NonNullable<GenerateClassroomInput['approvedPlan']> }).result
      : undefined;
  });

  const generationId = `recipe-${nanoid(6)}`;
  const ownerId = String(template.owner_id);
  await createClassroomGenerationJob(
    generationId,
    { ...templatePayload.input, approvedPlan: plan },
    ownerId,
  );
  await enqueueClassroomGeneration({ jobId: generationId, baseUrl, ownerId });
  console.log(`generation ${generationId} queued`);

  const classroomId = await waitFor('generation', async () => {
    const job = await readClassroomGenerationJob(generationId);
    if (job?.status === 'failed') throw new Error(`generation failed: ${job.error ?? job.message}`);
    return job?.status === 'succeeded' ? job.result?.classroomId : undefined;
  });
  console.log(`course ${classroomId} generated: ${baseUrl}/classroom/${classroomId}`);

  const audit = spawnSync('npx', ['tsx', 'scripts/design-audit.ts', classroomId], {
    stdio: 'inherit',
  });
  process.exit(audit.status ?? 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
