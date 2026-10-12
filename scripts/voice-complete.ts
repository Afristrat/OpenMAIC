/**
 * Generates the voices a persisted course is missing (speech lines without audio), then reports
 * what stays silent. Same function as the "Générer les voix manquantes" action of the platform.
 *
 *   tsx scripts/voice-complete.ts <stageId> [baseUrl]
 *
 * Exit code 1 when at least one line is still silent.
 */
import { activateUsageMeteringJob } from '@/lib/billing/usage-context';
import { completeMissingSpeechAudio } from '@/lib/server/classroom-voice-completion';
import { readClassroomOwnership } from '@/lib/server/classroom-storage';

async function main(): Promise<void> {
  const [stageId, baseUrl = 'https://qalem.ma'] = process.argv.slice(2);
  if (!stageId) {
    console.error('Usage: tsx scripts/voice-complete.ts <stageId> [baseUrl]');
    process.exit(2);
  }
  const ownership = await readClassroomOwnership(stageId);
  if (!ownership) {
    console.error(`Classroom ${stageId} not found`);
    process.exit(2);
  }
  // The usage reservation requires a stable idempotency key: one key per completion run.
  activateUsageMeteringJob(
    ownership.ownerId,
    ownership.orgId,
    `voice-completion-${stageId}-${Date.now()}`,
  );
  const report = await completeMissingSpeechAudio({
    classroomId: stageId,
    ownerId: ownership.ownerId,
    orgId: ownership.orgId,
    baseUrl,
    assertAccess: async () => {
      const current = await readClassroomOwnership(stageId);
      if (!current || current.orgId !== ownership.orgId || current.ownerId !== ownership.ownerId) {
        throw new Error('Classroom ownership changed during voice completion');
      }
    },
  });
  console.log(
    `requested ${report.requested} | generated ${report.generated} | still silent ${report.failed.length}`,
  );
  for (const failure of report.failed)
    console.log(`silent: scene ${failure.sceneId} ${failure.actionId}`);
  process.exit(report.failed.length > 0 ? 1 : 0);
}

void main();
